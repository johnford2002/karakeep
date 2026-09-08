/**
 * Vitest globalSetup shared by the suites that touch a database.
 *
 * On SQLite this does nothing — each test still gets its own `:memory:`
 * database. On PostgreSQL it builds the migrated template that every worker
 * clones from, once per vitest process rather than once per test.
 */
export async function setup() {
  if (process.env.DATABASE_DIALECT !== "postgresql") {
    return;
  }
  const { setupTemplateDatabase } = await import("./testDb");
  await setupTemplateDatabase();
}
