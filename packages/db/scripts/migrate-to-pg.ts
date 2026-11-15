/**
 * One-way data migration script: SQLite -> PostgreSQL
 *
 * Usage:
 *   DATABASE_DIALECT=postgresql \
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname \
 *   DATA_DIR=/path/to/data \
 *   pnpm --filter @karakeep/db migrate-to-pg
 *
 * Or with individual fields:
 *   DATABASE_DIALECT=postgresql \
 *   DATABASE_HOST=localhost DATABASE_PORT=5432 \
 *   DATABASE_USER=karakeep DATABASE_PASSWORD=secret DATABASE_NAME=karakeep \
 *   DATA_DIR=/path/to/data \
 *   pnpm --filter @karakeep/db migrate-to-pg
 */

import "dotenv/config";

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";
import type { migrate as pgMigrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";

import serverConfig, { buildPgConnectionString } from "@karakeep/shared/config";

import type { TablePlan } from "./migrateToPgPlan";
import {
  buildTablePlans,
  convertValue,
  orderSelfReferencingRows,
} from "./migrateToPgPlan";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (serverConfig.database.dialect !== "postgresql") {
  console.error(
    "ERROR: DATABASE_DIALECT must be set to 'postgresql' to run this migration.",
  );
  process.exit(1);
}

const connectionString = buildPgConnectionString(serverConfig.database);

/** Mask the password in a connection string for safe logging. */
function maskPassword(connStr: string): string {
  return connStr.replace(/:([^:@]+)@/, ":****@");
}

const sqlitePath = serverConfig.dataDir
  ? path.join(serverConfig.dataDir, "db.db")
  : "./db.db";

console.log("=".repeat(70));
console.log("  Karakeep SQLite -> PostgreSQL Migration");
console.log("=".repeat(70));
console.log();
console.log("WARNING: This script migrates data from SQLite to PostgreSQL.");
console.log("         Please ensure you have a backup of both databases");
console.log("         before proceeding. This operation is irreversible.");
console.log();
console.log(`  SQLite source  : ${sqlitePath}`);
console.log(`  PG target      : ${maskPassword(connectionString)}`);
console.log();

// ---------------------------------------------------------------------------
// Core migration logic
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 500;

/** Tables in the SQLite file that aren't app data. */
const NON_APP_TABLES = new Set(["__drizzle_migrations", "sqlite_sequence"]);

/**
 * Refuses to copy from a SQLite file whose tables or columns don't match the
 * schema this script was built against -- e.g. one that hasn't been migrated
 * to the same version, or that has tables this copy would silently skip.
 */
function checkSqliteMatchesPlans(
  sqlite: Database.Database,
  plans: TablePlan[],
): void {
  const planned = new Map(plans.map((p) => [p.table, p]));
  const tables = (
    sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .filter((name) => !NON_APP_TABLES.has(name));

  const problems: string[] = [];
  for (const table of tables) {
    const plan = planned.get(table);
    if (!plan) {
      problems.push(`table "${table}" isn't in the schema`);
      continue;
    }
    const actual = new Set(
      (
        sqlite.prepare(`PRAGMA table_xinfo("${table}")`).all() as {
          name: string;
          hidden: number;
        }[]
      )
        // hidden 2/3 = generated columns, which aren't copied.
        .filter((c) => c.hidden !== 2 && c.hidden !== 3)
        .map((c) => c.name),
    );
    for (const { name } of plan.columns) {
      if (!actual.has(name)) problems.push(`"${table}.${name}" is missing`);
    }
    for (const name of actual) {
      if (!plan.columns.some((c) => c.name === name)) {
        problems.push(`"${table}.${name}" isn't in the schema`);
      }
    }
  }
  for (const plan of plans) {
    if (!tables.includes(plan.table)) {
      problems.push(`table "${plan.table}" is missing`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      "The SQLite database doesn't match the schema this script copies. " +
        "Start Karakeep once on the SQLite database (so its migrations run), " +
        "using the same version as this script, then retry.\n  - " +
        problems.join("\n  - "),
    );
  }
}

async function migrateTable(
  sqlite: Database.Database,
  pg: postgres.Sql,
  plan: TablePlan,
): Promise<void> {
  const { table, columns: columnPlans } = plan;
  const columns = columnPlans.map((c) => c.name);
  const colList = columns.map((c) => `"${c}"`).join(", ");

  const totalRows = (
    sqlite.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get() as {
      cnt: number;
    }
  ).cnt;
  if (totalRows === 0) {
    console.log(`  [${table}] 0 rows — skipping`);
    return;
  }

  const convert = (raw: Record<string, unknown>) => {
    const row: Record<string, unknown> = {};
    for (const { name, conversion } of columnPlans) {
      row[name] = convertValue(conversion, raw[name]);
    }
    return row;
  };

  let insertedCount = 0;
  const flush = async (chunk: Record<string, unknown>[]) => {
    await insertChunk(pg, table, columns, chunk);
    insertedCount += chunk.length;
    console.log(`  [${table}] ${insertedCount} / ${totalRows} rows inserted`);
  };

  const stmt = sqlite.prepare(`SELECT ${colList} FROM "${table}"`);
  if (plan.selfReferences.length > 0) {
    // Parents have to be inserted before the rows pointing at them, so these
    // (small) tables are ordered in memory first.
    const rows = orderSelfReferencingRows(
      (stmt.all() as Record<string, unknown>[]).map(convert),
      plan.selfReferences,
    );
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await flush(rows.slice(i, i + CHUNK_SIZE));
    }
  } else {
    let chunk: Record<string, unknown>[] = [];
    for (const raw of stmt.iterate()) {
      chunk.push(convert(raw as Record<string, unknown>));
      if (chunk.length >= CHUNK_SIZE) {
        await flush(chunk);
        chunk = [];
      }
    }
    if (chunk.length > 0) await flush(chunk);
  }

  console.log(`  [${table}] Done — ${insertedCount} rows migrated`);
}

async function insertChunk(
  pg: postgres.Sql,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;

  // Build a parameterised bulk insert using pg.unsafe() with explicit
  // positional parameters so we avoid any SQL injection risk while still
  // being able to use postgres.js parameter syntax.
  //
  // Pattern:  INSERT INTO "table" ("col1","col2",...) VALUES ($1,$2,...),(...),...
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const col of columns) {
      values.push(row[col] ?? null);
      placeholders.push(`$${values.length}`);
    }
    rowPlaceholders.push(`(${placeholders.join(", ")})`);
  }

  const sql = `INSERT INTO "${table}" (${colList}) VALUES ${rowPlaceholders.join(", ")} ON CONFLICT DO NOTHING`;

  await pg.unsafe(sql, values as never[]);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Open SQLite in readonly mode
  const BetterSQLite = require("better-sqlite3") as {
    new (filename: string, options?: { readonly?: boolean }): Database.Database;
  };
  const sqlite = new BetterSQLite(sqlitePath, { readonly: true });
  console.log("SQLite database opened (readonly).");

  // Fail before touching PostgreSQL if anything can't be copied faithfully.
  const plans = buildTablePlans();
  checkSqliteMatchesPlans(sqlite, plans);

  // Connect to PostgreSQL
  const pgClient = require("postgres") as typeof postgres;
  const pg = pgClient(connectionString);
  console.log("PostgreSQL connection established.");

  // Run PG migrations first
  console.log("\nRunning PostgreSQL migrations...");
  const { drizzle } =
    require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  const { migrate } = require("drizzle-orm/postgres-js/migrator") as {
    migrate: typeof pgMigrate;
  };

  // The migrator gets its own connection. drizzle(client) swaps the client's
  // timestamp and JSON serializers for pass-throughs, since drizzle encodes
  // those itself -- and the raw inserts below hand postgres-js Date objects
  // and parsed JSON, which it can then no longer encode ("The string argument
  // must be of type string ... Received an instance of Date").
  const migrationClient = pgClient(connectionString, { max: 1 });
  await migrate(drizzle(migrationClient), {
    migrationsFolder: path.resolve(__dirname, "../migrations/pg"),
  });
  await migrationClient.end();
  console.log("Migrations complete.\n");

  // Migrate each table in dependency order
  console.log(`Migrating ${plans.length} tables...\n`);
  for (const plan of plans) {
    await migrateTable(sqlite, pg, plan);
  }

  // Cleanup
  sqlite.close();
  await pg.end();

  console.log("\nMigration complete!");
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
