import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards against drizzle's better-sqlite3-only sync API leaking back into
 * application code.
 *
 * `.run()` / `.all()` / `.get()` / `.sync()` exist only on drizzle's SQLite
 * query builders. postgres-js exposes `.execute()` instead, so any of these on
 * a query builder throws "x is not a function" under
 * DATABASE_DIALECT=postgresql -- at runtime, in production, on whichever code
 * path happens to hit it.
 *
 * Nothing else catches this: the test suites all run against in-memory SQLite,
 * where these methods work fine. Upstream writes transactions in this style, so
 * merges keep reintroducing them. Await the builder instead -- both dialects
 * support that.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const SEARCH_DIRS = ["apps", "packages"];

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".expo",
  ".turbo",
  "drizzle",
  "migrations",
]);

// Reads the SQLite source database directly, by design.
const ALLOWED_FILES = new Set([
  path.join("packages", "db", "scripts", "migrate-to-pg.ts"),
]);

const SYNC_CALL = /\.(run|all|get|sync)\(\)/;

// A statement is drizzle's if it also builds a query.
const DRIZZLE_VERB =
  /\.(insert|update|delete|select|selectDistinct|values|returning|onConflictDoNothing|findFirst|findMany)\(|\.query\./;

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("drizzle sqlite-only sync API", () => {
  it("is not used anywhere in application code", () => {
    const offenders: string[] = [];

    for (const dir of SEARCH_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file);
        if (ALLOWED_FILES.has(rel)) continue;
        if (rel.includes("__tests__") || /\.test\.tsx?$/.test(rel)) continue;

        const src = stripComments(readFileSync(file, "utf8"));
        if (!SYNC_CALL.test(src)) continue;

        // Split into statements so a chain spanning several lines is judged whole.
        for (const stmt of src.split(";")) {
          if (SYNC_CALL.test(stmt) && DRIZZLE_VERB.test(stmt)) {
            const line =
              stmt.split("\n").find((l) => SYNC_CALL.test(l)) ?? stmt;
            offenders.push(`${rel}: ${line.trim()}`);
          }
        }
      }
    }

    expect(
      offenders,
      `Drizzle's SQLite-only sync API found in application code. These throw ` +
        `under DATABASE_DIALECT=postgresql. Await the query builder instead:\n` +
        offenders.map((o) => `  ${o}`).join("\n"),
    ).toEqual([]);
  });
});
