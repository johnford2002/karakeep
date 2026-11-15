import type { AnyColumn } from "drizzle-orm";
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
 * Extracts the domain (hostname) from a URL column, stripping the protocol
 * and path. Works across both SQLite and PostgreSQL.
 *
 * Mirrors upstream's inline SQLite expression branch for branch: an http(s)
 * URL yields everything up to the first `/` after the scheme, and anything
 * else yields everything up to its first `/`. PostgreSQL has no INSTR, but
 * split_part returns the whole string when the delimiter is absent, which is
 * exactly the INSTR(...) = 0 fallthrough.
 */
export function domainFromUrl(urlColumn: AnyColumn): SQL<string> {
  if (dialect === "postgresql") {
    return sql`CASE
      WHEN ${urlColumn} LIKE 'https://%' THEN split_part(substr(${urlColumn}, 9), '/', 1)
      WHEN ${urlColumn} LIKE 'http://%' THEN split_part(substr(${urlColumn}, 8), '/', 1)
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
