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
 */
export function domainFromUrl(urlColumn: AnyColumn): SQL<string> {
  if (dialect === "postgresql") {
    // PostgreSQL: use substring with regex to extract host
    return sql`substring(${urlColumn} from '://([^/]+)')`;
  }
  // SQLite: use INSTR/SUBSTR to extract host
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
      ${urlColumn}
    END`;
}
