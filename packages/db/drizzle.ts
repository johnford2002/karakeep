import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";

import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { drizzle as sqliteDrizzle } from "drizzle-orm/better-sqlite3";
import type { migrate as sqliteMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type {
  drizzle as pgDrizzle,
  PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import serverConfig, { buildPgConnectionString } from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { instrumentSqliteDatabase } from "./instrumentation";
import { applyChangesAlias, PG_CLIENT_TYPES } from "./pgCompat";
import * as pgSchema from "./schema.pg";
import * as relations from "./schema.relations";
import * as sqliteSchema from "./schema.sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Raw database client, stored for graceful shutdown via close().
let _rawClient: Database.Database | ReturnType<typeof postgres> | null = null;

export const dialect = serverConfig.database.dialect;

// Optional SQL query logging, routed through the app logger at debug level.
// Gated behind DB_QUERY_LOGGING (not just LOG_LEVEL) because it is high-volume
// and may include query parameter values.  Enable it to see what the DB is
// doing — e.g. exactly when a query fires relative to the request that issued
// it.  When disabled it is `false`, so Drizzle never invokes it (zero cost).
const queryLogger = serverConfig.dbQueryLogging
  ? {
      logQuery(query: string, params: unknown[]) {
        logger.debug(
          `[db] ${query}${params.length ? ` -- params: ${JSON.stringify(params)}` : ""}`,
        );
      },
    }
  : false;

// The canonical schema type used for DB typing.
// Both SQLite and PG schemas export identical table/column names, so the
// SQLite schema type is used as the canonical type for TypeScript regardless
// of the active dialect.  This avoids a union DB type that would break
// downstream consumers trying to call query / select / insert etc.
type FullSchema = typeof sqliteSchema & typeof relations;

// Compile-time check: verify that PostgresJsDatabase exposes the same
// core methods as BetterSQLite3Database.  If a Drizzle upgrade breaks
// structural compatibility, this block will produce a type error.
// See .claude/specs/2026-04-12-postgresql-review-fixes-design.md for rationale.
type _PgDB = PostgresJsDatabase<FullSchema>;
type _AssertHas<T, K extends keyof T> = K;
type _PgCompat =
  | _AssertHas<_PgDB, "select">
  | _AssertHas<_PgDB, "selectDistinct">
  | _AssertHas<_PgDB, "insert">
  | _AssertHas<_PgDB, "update">
  | _AssertHas<_PgDB, "delete">
  | _AssertHas<_PgDB, "query">
  | _AssertHas<_PgDB, "transaction">
  | _AssertHas<_PgDB, "$count">;
type _Used = _PgCompat; // suppress unused warning

async function createSqliteDB() {
  const { drizzle } =
    (await import("drizzle-orm/better-sqlite3")) as unknown as {
      drizzle: typeof sqliteDrizzle;
    };
  // Imported dynamically so that better-sqlite3 is never loaded on the
  // PostgreSQL path.
  const { openSqliteDatabase } = await import("./sqlite");

  const databaseURL = serverConfig.dataDir
    ? `${serverConfig.dataDir}/db.db`
    : "./db.db";

  logger.info(`[db] opening SQLite database at ${databaseURL}`);
  const sqlite = openSqliteDatabase(databaseURL, {
    readOnly: serverConfig.degradedMode,
    walMode: serverConfig.database.walMode,
  });
  _rawClient = sqlite;

  instrumentSqliteDatabase(sqlite);

  return drizzle(sqlite, {
    schema: { ...sqliteSchema, ...relations },
    logger: queryLogger,
  });
}

async function createPostgresDB() {
  const { default: pgClient } = (await import("postgres")) as unknown as {
    default: typeof postgres;
  };
  const { drizzle } = (await import("drizzle-orm/postgres-js")) as unknown as {
    drizzle: typeof pgDrizzle;
  };

  const connectionString = buildPgConnectionString(serverConfig.database);

  logger.info(
    `[db] connecting to PostgreSQL ${serverConfig.database.host ?? "?"}:${serverConfig.database.port}/${serverConfig.database.name ?? "?"}`,
  );

  // PostgreSQL COUNT/SUM return bigint (OID 20), which postgres.js delivers
  // as a string by default.  The app expects plain numbers everywhere, so
  // parse bigint results as Number via the documented types API.  Safe for
  // the counts and sums used in this application (well within
  // Number.MAX_SAFE_INTEGER).
  const client = pgClient(connectionString, {
    max: serverConfig.database.poolSize,
    types: PG_CLIENT_TYPES,
  });
  _rawClient = client;

  // Shared with the test harness so the two clients cannot drift; see
  // ./pgCompat.ts.
  await applyChangesAlias(client);
  logger.info("[db] PostgreSQL connection established");

  // Eagerly open all pool connections now, during startup, where latency is
  // harmless. postgres.js opens connections lazily, so without this the first
  // burst of concurrent requests must open several connections at once and
  // pays the full per-connection establishment cost in series — which showed
  // up as a ~30s stall on the first cold-cache page load when connecting to
  // PostgreSQL is slow (e.g. reverse-DNS-on-connect). Holding `poolSize`
  // connections simultaneously (pg_sleep) forces the pool to actually fill
  // rather than reuse one fast slot.
  const poolSize = serverConfig.database.poolSize;
  try {
    logger.info(`[db] pre-warming connection pool (${poolSize} connections)`);
    await Promise.all(
      Array.from({ length: poolSize }, () => client`SELECT pg_sleep(0.05)`),
    );
    logger.info("[db] connection pool warmed");
  } catch (e) {
    logger.warn(`[db] connection pool pre-warm failed (continuing): ${e}`);
  }

  return drizzle(client, {
    schema: { ...pgSchema, ...relations },
    logger: queryLogger,
  });
}

// Drizzle has no shared base type between SQLite and PG — they are separate
// type hierarchies.  A union type would require narrowing at every call site
// (~250 usages across 47 files), and a wrapper class can't properly type the
// dialect-specific builder return values.
//
// Instead we use BetterSQLite3Database as the canonical compile-time type and
// cast the PG instance into it.  This works because the query builder APIs are
// structurally compatible at runtime.  The _PgCompat type assertion above
// catches Drizzle upgrades that remove any of the methods we depend on.
export const db: BetterSQLite3Database<FullSchema> =
  dialect === "postgresql"
    ? ((await createPostgresDB()) as unknown as BetterSQLite3Database<FullSchema>)
    : ((await createSqliteDB()) as unknown as BetterSQLite3Database<FullSchema>);
export type DB = typeof db;

// Dialect-agnostic transaction type inferred from the db instance
export type KarakeepDBTransaction = Parameters<
  Parameters<DB["transaction"]>[0]
>[0];

export async function getInMemoryDB(runMigrations: boolean) {
  const { default: SqliteDatabase } =
    (await import("better-sqlite3")) as unknown as {
      default: new (filename: string | Buffer) => Database.Database;
    };
  const { drizzle } =
    (await import("drizzle-orm/better-sqlite3")) as unknown as {
      drizzle: typeof sqliteDrizzle;
    };
  const { migrate } =
    (await import("drizzle-orm/better-sqlite3/migrator")) as unknown as {
      migrate: typeof sqliteMigrate;
    };

  const mem = new SqliteDatabase(":memory:");
  const db = drizzle(mem, {
    schema: { ...sqliteSchema, ...relations },
    logger: false,
  });
  if (runMigrations) {
    migrate(db, {
      migrationsFolder: path.resolve(__dirname, "./migrations/sqlite"),
    });
  }
  return db;
}

/**
 * Gracefully close the database connection.
 * Safe to call multiple times; no-ops after the first call.
 */
export async function close(): Promise<void> {
  if (_rawClient === null) return;
  if (dialect === "postgresql") {
    await (_rawClient as ReturnType<typeof postgres>).end();
  } else {
    (_rawClient as Database.Database).close();
  }
  _rawClient = null;
}
