// SQLite: SQLITE_CONSTRAINT_UNIQUE or SQLITE_CONSTRAINT_PRIMARYKEY
// PostgreSQL: 23505 (unique_violation)
const UNIQUE_CONSTRAINT_CODES = new Set([
  "SQLITE_CONSTRAINT_UNIQUE",
  "SQLITE_CONSTRAINT_PRIMARYKEY",
  "23505",
]);

export function isUniqueConstraintError(e: unknown): boolean {
  // Drizzle wraps driver errors in a DrizzleQueryError, which carries no code
  // of its own and keeps the original (a PostgresError, say) on `cause`. So
  // walk the chain rather than only inspecting the outermost error.
  let current: unknown = e;
  for (let depth = 0; current != null && depth < 5; depth++) {
    if (typeof current !== "object") {
      return false;
    }
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && UNIQUE_CONSTRAINT_CODES.has(code)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
