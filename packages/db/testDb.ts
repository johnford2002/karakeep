/**
 * PostgreSQL-backed test databases.
 *
 * The suites historically ran only against in-memory SQLite, which cannot see
 * dialect-specific bugs at all -- drizzle's `.run()`/`.all()`/`.get()` exist on
 * the SQLite query builders but not on postgres-js, so those paths pass in CI
 * and throw in production. This module lets the same suites run against a real
 * PostgreSQL server.
 *
 * Shape of it:
 *
 *   - `setupTemplateDatabase()` runs once per vitest process (globalSetup). It
 *     builds `<base>_template` and migrates it.
 *   - each vitest worker lazily clones its own `<base>_w<N>` from that template
 *     the first time it asks for a database, and keeps the connection.
 *   - every `getTestDatabase()` call -- which is per test -- truncates instead
 *     of recreating, which is what makes this affordable.
 *
 * Cloning per worker rather than per test matters: `CREATE DATABASE ...
 * TEMPLATE` takes a lock on the template, so doing it 448 times across parallel
 * workers would serialise the whole suite.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import { applyChangesAlias, PG_CLIENT_TYPES } from "./pgCompat";
import * as pgSchema from "./schema.pg";
import * as relations from "./schema.relations";

/** Databases are named from this so a run never collides with a real one. */
const BASE_NAME = "karakeep_test";
const TEMPLATE_NAME = `${BASE_NAME}_template`;

type PgClient = ReturnType<typeof postgres>;

interface WorkerDatabase {
  db: PostgresJsDatabase<Record<string, unknown>>;
  client: PgClient;
  /** Cached so the truncate does not re-query the catalog on every test. */
  tables: string[] | null;
}

let workerDatabase: WorkerDatabase | null = null;

/**
 * Connection string for the server, minus any database. Tests point at the
 * server; this module decides which database to actually use.
 */
function adminUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "PostgreSQL tests need TEST_DATABASE_URL (or DATABASE_URL) pointing at a server",
    );
  }
  return url;
}

/** Swap the database portion of a connection string. */
function urlForDatabase(name: string): string {
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * `max` matters more than it looks. withTransaction reserves a connection for
 * the duration of the transaction, so any query the callback issues alongside
 * it needs a second one; a pool of 1 deadlocks against itself and the test
 * simply hangs. Admin work (CREATE/DROP DATABASE) is strictly sequential and
 * can stay at 1.
 */
async function connect(url: string, max = 10): Promise<PgClient> {
  const { default: pgClient } = (await import("postgres")) as unknown as {
    default: typeof postgres;
  };
  // Same type conversions as the production client, or the suite reports
  // failures production does not have (COUNT() arrives as a string without it).
  return pgClient(url, {
    max,
    types: PG_CLIENT_TYPES,
    onnotice: () => undefined,
  });
}

/**
 * Identifiers are interpolated into DDL that cannot be parameterised, so keep
 * them to a shape that cannot escape the statement.
 */
function assertSafeIdentifier(name: string): string {
  // Table names here are camelCase ("bookmarkLinks", "verificationToken"), so
  // uppercase is allowed; they are quoted at the call site regardless.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return name;
}

/**
 * Build the template database and migrate it. Runs once per vitest process,
 * before any worker starts.
 */
export async function setupTemplateDatabase(): Promise<void> {
  const admin = await connect(urlForDatabase("postgres"), 1);
  try {
    await dropDatabasesWithPrefix(admin, BASE_NAME);
    await admin.unsafe(
      `CREATE DATABASE ${assertSafeIdentifier(TEMPLATE_NAME)}`,
    );
  } finally {
    await admin.end();
  }

  const client = await connect(urlForDatabase(TEMPLATE_NAME));
  try {
    const { drizzle } =
      (await import("drizzle-orm/postgres-js")) as unknown as {
        drizzle: (c: PgClient, o: unknown) => PostgresJsDatabase<never>;
      };
    const { migrate } =
      (await import("drizzle-orm/postgres-js/migrator")) as unknown as {
        migrate: (
          db: unknown,
          o: { migrationsFolder: string },
        ) => Promise<void>;
      };
    const db = drizzle(client, { schema: { ...pgSchema, ...relations } });
    await migrate(db, { migrationsFolder: migrationsDir() });
  } finally {
    await client.end();
  }
}

function migrationsDir(): string {
  // Resolved from this file so it works regardless of the suite's cwd.
  //
  // Deliberately not `new URL("./migrations/pg", import.meta.url)`: bundlers
  // read that as a static asset reference and try to resolve it at build time,
  // which fails because it is a directory. Next's Turbopack traces this module
  // through drizzle.ts into the web app, so it has to stay resolvable there.
  // drizzle.ts uses this same pattern for the SQLite migrations.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "./migrations/pg");
}

/** Remove databases left behind by an interrupted run. */
async function dropDatabasesWithPrefix(
  admin: PgClient,
  prefix: string,
): Promise<void> {
  const rows = (await admin`
    SELECT datname FROM pg_database WHERE datname LIKE ${prefix + "%"}
  `) as unknown as { datname: string }[];
  for (const { datname } of rows) {
    await admin.unsafe(
      `DROP DATABASE IF EXISTS ${assertSafeIdentifier(datname)} WITH (FORCE)`,
    );
  }
}

/** Vitest numbers its workers; fall back to the pid for a single-threaded run. */
function workerId(): string {
  const id =
    process.env.VITEST_WORKER_ID ??
    process.env.VITEST_POOL_ID ??
    String(process.pid);
  return id.replace(/[^0-9]/g, "") || String(process.pid);
}

/**
 * A migrated, empty PostgreSQL database for the calling test.
 *
 * The first call in a worker clones the template; later calls truncate, which
 * is the difference between ~10ms and a fresh database per test.
 */
export async function getTestDatabase(): Promise<
  PostgresJsDatabase<Record<string, unknown>>
> {
  if (!workerDatabase) {
    workerDatabase = await createWorkerDatabase();
  }
  await truncateAll(workerDatabase);
  return workerDatabase.db;
}

async function createWorkerDatabase(): Promise<WorkerDatabase> {
  const name = `${BASE_NAME}_w${workerId()}`;
  assertSafeIdentifier(name);

  const admin = await connect(urlForDatabase("postgres"), 1);
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_NAME}`);
  } finally {
    await admin.end();
  }

  const client = await connect(urlForDatabase(name));
  await applyChangesAlias(client);
  const { drizzle } = (await import("drizzle-orm/postgres-js")) as unknown as {
    drizzle: (
      c: PgClient,
      o: unknown,
    ) => PostgresJsDatabase<Record<string, unknown>>;
  };
  const db = drizzle(client, { schema: { ...pgSchema, ...relations } });
  return { db, client, tables: null };
}

async function truncateAll(worker: WorkerDatabase): Promise<void> {
  worker.tables ??= (
    (await worker.client`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `) as unknown as { tablename: string }[]
  ).map((r) => assertSafeIdentifier(r.tablename));

  if (worker.tables.length === 0) {
    return;
  }
  // One statement so foreign keys never see a half-empty database. The drizzle
  // bookkeeping table lives in its own schema and is untouched.
  const list = worker.tables.map((t) => `"${t}"`).join(", ");
  await worker.client.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Close this worker's connection. Safe to call when nothing was opened. */
export async function closeTestDatabase(): Promise<void> {
  if (!workerDatabase) {
    return;
  }
  await workerDatabase.client.end();
  workerDatabase = null;
}
