import type postgres from "postgres";

/**
 * The postgres-js compatibility shims, in one place so the production client
 * and the test client cannot drift apart.
 *
 * They diverged once already: the test harness created a plain client, so
 * COUNT() came back as a string there and as a number in production. That
 * makes the PostgreSQL test leg report failures that production does not have,
 * which is worse than no coverage — nobody trusts a suite that cries wolf.
 */

/**
 * PostgreSQL returns bigint (OID 20) as a string by default; the app expects
 * plain numbers everywhere. Safe for the counts and sums used here, all of
 * which sit well inside Number.MAX_SAFE_INTEGER.
 *
 * Note this covers bigint only. `SUM()` over an integer returns *numeric*
 * (OID 1700), which is not converted — callers that need a number from a SUM
 * have to coerce it themselves.
 */
export const PG_CLIENT_TYPES = {
  bigint: {
    to: 20,
    from: [20],
    serialize: (val: number) => String(val),
    parse: (val: string) => Number(val),
  },
};

/**
 * The codebase reads `.changes` on mutation results, a better-sqlite3
 * convention; postgres-js calls it `.count`. Alias it on the Result prototype
 * so existing call sites work unchanged.
 *
 * Verifies itself against a real DML statement: DDL leaves `.count` null, so
 * only a mutation proves the alias works. A driver upgrade that reshapes the
 * Result class then fails here rather than silently at runtime.
 */
export async function applyChangesAlias(
  client: ReturnType<typeof postgres>,
): Promise<void> {
  const probe = await client`SELECT 1`;
  const ResultProto = Object.getPrototypeOf(probe) as object;
  if (!("changes" in ResultProto)) {
    Object.defineProperty(ResultProto, "changes", {
      get(this: { count: number }) {
        return this.count;
      },
      configurable: true,
    });
  }

  await client`CREATE TEMP TABLE IF NOT EXISTS _karakeep_verify(x int)`;
  const verify = (await client`DELETE FROM _karakeep_verify`) as unknown as {
    changes?: unknown;
  };
  await client`DROP TABLE IF EXISTS _karakeep_verify`;
  if (typeof verify.changes !== "number") {
    throw new Error(
      "PostgreSQL .changes compatibility patch failed. " +
        "This likely means the postgres.js driver version is incompatible. " +
        `Expected numeric .changes, got ${typeof verify.changes}. ` +
        "Pin postgres to ~3.4.9 or update the patch in pgCompat.ts.",
    );
  }
}
