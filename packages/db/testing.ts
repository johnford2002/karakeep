/**
 * Entry point for test databases, on either dialect.
 *
 * Deliberately separate from drizzle.ts. The dialect switch used to live inside
 * `getInMemoryDB` there, which meant production code referenced ./testDb --
 * and bundlers follow a dynamic import just as readily as a static one, so
 * Turbopack pulled the whole PostgreSQL test harness into the web app's server
 * chunks. Keeping the switch here means nothing production imports can reach
 * test code, and drizzle.ts stays byte-identical to upstream's, which is one
 * less thing to reconcile on every sync.
 *
 * Tests should import this instead of `getInMemoryDB`.
 */
import { dialect, getInMemoryDB } from "./drizzle";

/**
 * A migrated, empty database for a single test.
 *
 * SQLite gets a fresh `:memory:` database per call. PostgreSQL gets a real
 * database, cloned once per worker from a migrated template and truncated
 * between tests -- see ./testDb.ts.
 */
export async function getTestDb(runMigrations = true) {
  if (dialect === "postgresql") {
    const { getTestDatabase } = await import("./testDb");
    // The template is already migrated, so runMigrations has nothing to do.
    return (await getTestDatabase()) as unknown as Awaited<
      ReturnType<typeof getInMemoryDB>
    >;
  }
  return await getInMemoryDB(runMigrations);
}
