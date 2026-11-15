import type { AnyColumn, SQLWrapper } from "drizzle-orm";
import { sql, SQL } from "drizzle-orm";

import { dialect } from "./drizzle";

/**
 * Narrows to rows whose JSON-in-text column mentions `needle` anywhere.
 *
 * SQLite can inspect the document directly with json_valid / json_extract /
 * json_each, but PostgreSQL 14 spells none of those the same way, and the
 * column is `text` that is allowed to hold invalid JSON, so casting to jsonb
 * to query it would error on exactly the rows the callers skip. A substring
 * match is portable and index-free but only ever used as a prefilter: callers
 * parse and validate every row it returns and decide from the parsed value.
 */
export function jsonTextMentions(column: AnyColumn, needle: string): SQL {
  return sql`${column} LIKE ${`%${needle}%`}`;
}

/**
 * `value LIKE pattern`, ignoring case on both dialects.
 *
 * SQLite's LIKE ignores ASCII case but PostgreSQL's does not, so a bare LIKE
 * finds "React" when searching "react" on SQLite and misses it on PostgreSQL.
 * Both sides are folded with lower(), which on SQLite (like its LIKE) folds
 * ASCII only, so the two dialects match the same rows. Use this rather than
 * drizzle's `like()` anywhere user-facing text is matched.
 *
 * The pattern is a bound parameter, so don't use it inside an expression that
 * is also GROUP BY'd: see domainFromUrl.
 */
export function likeIgnoringCase(value: SQLWrapper, pattern: string): SQL {
  return sql`lower(${value}) LIKE lower(${pattern})`;
}

/** `value NOT LIKE pattern`, ignoring case; see likeIgnoringCase. */
export function notLikeIgnoringCase(value: SQLWrapper, pattern: string): SQL {
  return sql`lower(${value}) NOT LIKE lower(${pattern})`;
}

/**
 * Extracts the domain (hostname) from a URL column, stripping the protocol
 * and path. Works across both SQLite and PostgreSQL.
 *
 * Mirrors upstream's inline SQLite expression branch for branch: an http(s)
 * URL yields everything up to the first `/` after the scheme, and anything
 * else yields everything up to its first `/`. PostgreSQL has no INSTR, but
 * split_part returns the whole string when the delimiter is absent, which is
 * exactly the INSTR(...) = 0 fallthrough. The scheme checks fold case there
 * too, since SQLite's LIKE does and PostgreSQL's doesn't ("HTTPS://..." would
 * otherwise come out as the domain "HTTPS:"). The patterns are literals,
 * not likeIgnoringCase's bound parameters: callers GROUP BY this expression,
 * and PostgreSQL only matches the grouped and selected copies when they are
 * textually identical, which separately numbered parameters ($1 vs $5) are not.
 */
export function domainFromUrl(urlColumn: AnyColumn): SQL<string> {
  if (dialect === "postgresql") {
    return sql`CASE
      WHEN lower(${urlColumn}) LIKE 'https://%' THEN split_part(substr(${urlColumn}, 9), '/', 1)
      WHEN lower(${urlColumn}) LIKE 'http://%' THEN split_part(substr(${urlColumn}, 8), '/', 1)
      ELSE split_part(${urlColumn}, '/', 1)
    END`;
  }
  return sql`CASE
    WHEN ${urlColumn} LIKE 'https://%' THEN
      CASE
        WHEN INSTR(SUBSTR(${urlColumn}, 9), '/') > 0 THEN
          SUBSTR(${urlColumn}, 9, INSTR(SUBSTR(${urlColumn}, 9), '/') - 1)
        ELSE
          SUBSTR(${urlColumn}, 9)
      END
    WHEN ${urlColumn} LIKE 'http://%' THEN
      CASE
        WHEN INSTR(SUBSTR(${urlColumn}, 8), '/') > 0 THEN
          SUBSTR(${urlColumn}, 8, INSTR(SUBSTR(${urlColumn}, 8), '/') - 1)
        ELSE
          SUBSTR(${urlColumn}, 8)
      END
    ELSE
      CASE
        WHEN INSTR(${urlColumn}, '/') > 0 THEN
          SUBSTR(${urlColumn}, 1, INSTR(${urlColumn}, '/') - 1)
        ELSE
          ${urlColumn}
      END
    END`;
}
