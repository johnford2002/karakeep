/**
 * How migrate-to-pg converts each SQLite table, derived from the two drizzle
 * schemas rather than kept by hand.
 *
 * The hand-kept list this replaces drifted on every upstream sync: columns it
 * didn't know about were copied raw, so an epoch-seconds integer landed in a
 * `timestamptz` as a date in January 1970, JSON text landed in `jsonb` as a
 * JSON *string*, and whole tables (the chat tables) were never copied at all.
 * None of that errored. Here every column's conversion comes from its SQLite
 * declaration paired with its PostgreSQL type, and anything that can't be
 * classified throws before a single row is written.
 */
import type { AnyColumn, Table } from "drizzle-orm";
import { is } from "drizzle-orm";
import {
  getTableConfig as getPgTableConfig,
  PgTable,
} from "drizzle-orm/pg-core";
import {
  getTableConfig as getSqliteTableConfig,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";

import * as pgSchema from "../schema.pg";
import * as sqliteSchema from "../schema.sqlite";

export type Conversion =
  | "asIs"
  | "epochSecondsToDate"
  | "epochMsToDate"
  | "intToBool"
  | "parseJson";

export interface ColumnPlan {
  /** SQL column name (the same on both dialects). */
  name: string;
  conversion: Conversion;
}

export interface TablePlan {
  /** SQL table name (the same on both dialects). */
  table: string;
  /** Columns to copy, in insert order. Generated columns are left out. */
  columns: ColumnPlan[];
  /** Columns that reference this same table (e.g. a list's parentId). */
  selfReferences: { column: string; references: string }[];
}

function columnMode(column: AnyColumn): string | undefined {
  return (column as unknown as { mode?: string }).mode;
}

function conversionFor(
  table: string,
  sqlite: AnyColumn,
  pg: AnyColumn,
): Conversion {
  const where = `${table}.${sqlite.name}`;
  switch (pg.columnType) {
    case "PgTimestamp":
      if (sqlite.columnType === "SQLiteTimestamp") {
        const mode = columnMode(sqlite);
        if (mode === "timestamp") return "epochSecondsToDate";
        if (mode === "timestamp_ms") return "epochMsToDate";
      }
      break;
    case "PgBoolean":
      if (sqlite.columnType === "SQLiteBoolean") return "intToBool";
      break;
    case "PgJsonb":
    case "PgJson":
      if (
        sqlite.columnType === "SQLiteTextJson" ||
        sqlite.columnType === "SQLiteText"
      ) {
        return "parseJson";
      }
      break;
    case "PgText":
      if (sqlite.columnType === "SQLiteText") return "asIs";
      break;
    case "PgInteger":
      if (sqlite.columnType === "SQLiteInteger") return "asIs";
      break;
    case "PgDoublePrecision":
      if (
        sqlite.columnType === "SQLiteReal" ||
        sqlite.columnType === "SQLiteInteger"
      ) {
        return "asIs";
      }
      break;
  }
  throw new Error(
    `migrate-to-pg doesn't know how to convert ${where} ` +
      `(SQLite ${sqlite.columnType}${columnMode(sqlite) ? `/${columnMode(sqlite)}` : ""} -> ` +
      `PostgreSQL ${pg.columnType}). Add the pair to conversionFor().`,
  );
}

function tablesOf<T extends Table>(
  schema: Record<string, unknown>,
  kind: new (...args: never[]) => T,
): T[] {
  return Object.values(schema).filter((t): t is T =>
    is(t, kind as never),
  ) as T[];
}

/**
 * One plan per table, ordered so every table comes after the tables its
 * foreign keys point at.
 */
export function buildTablePlans(): TablePlan[] {
  const pgByName = new Map(
    tablesOf(pgSchema, PgTable).map((t) => {
      const config = getPgTableConfig(t);
      return [config.name, config] as const;
    }),
  );

  const plans = new Map<string, TablePlan>();
  const dependsOn = new Map<string, Set<string>>();

  for (const table of tablesOf(sqliteSchema, SQLiteTable)) {
    const config = getSqliteTableConfig(table);
    const pg = pgByName.get(config.name);
    if (!pg) {
      throw new Error(
        `Table "${config.name}" is in the SQLite schema but not the PostgreSQL one.`,
      );
    }
    const pgColumns = new Map(pg.columns.map((c) => [c.name, c]));

    const columns: ColumnPlan[] = [];
    for (const column of config.columns) {
      // Generated columns are computed by the database on both sides.
      if (column.generated) continue;
      const pgColumn = pgColumns.get(column.name);
      if (!pgColumn) {
        throw new Error(
          `Column "${config.name}.${column.name}" is in the SQLite schema but not the PostgreSQL one.`,
        );
      }
      columns.push({
        name: column.name,
        conversion: conversionFor(config.name, column, pgColumn),
      });
    }

    const deps = new Set<string>();
    const selfReferences: TablePlan["selfReferences"] = [];
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      const target = getSqliteTableConfig(ref.foreignTable as SQLiteTable).name;
      if (target === config.name) {
        selfReferences.push({
          column: ref.columns[0].name,
          references: ref.foreignColumns[0].name,
        });
      } else {
        deps.add(target);
      }
    }

    plans.set(config.name, { table: config.name, columns, selfReferences });
    dependsOn.set(config.name, deps);
  }

  // Topological order (Kahn's algorithm), alphabetical among ready tables so
  // the order is stable from run to run.
  const ordered: TablePlan[] = [];
  const remaining = new Map(dependsOn);
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, deps]) => [...deps].every((d) => !remaining.has(d)))
      .map(([name]) => name)
      .sort();
    if (ready.length === 0) {
      throw new Error(
        `Foreign key cycle between tables: ${[...remaining.keys()].join(", ")}`,
      );
    }
    for (const name of ready) {
      ordered.push(plans.get(name)!);
      remaining.delete(name);
    }
  }
  return ordered;
}

/** Convert one SQLite value for insertion into its PostgreSQL column. */
export function convertValue(conversion: Conversion, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (conversion) {
    case "asIs":
      return value;
    case "epochSecondsToDate":
      return new Date(Number(value) * 1000);
    case "epochMsToDate":
      return new Date(Number(value));
    case "intToBool":
      return Number(value) !== 0;
    case "parseJson":
      return typeof value === "string" ? JSON.parse(value) : value;
  }
}

/**
 * Orders a self-referencing table's rows so each row comes after the row it
 * points at (e.g. a parent list before its children), since the foreign key
 * is checked on every insert. Rows in a reference cycle, or pointing at a row
 * that doesn't exist, keep their relative order at the end; the database then
 * reports them, rather than the copy silently reordering data it can't place.
 */
export function orderSelfReferencingRows(
  rows: Record<string, unknown>[],
  selfReferences: TablePlan["selfReferences"],
): Record<string, unknown>[] {
  if (selfReferences.length === 0) return rows;
  const placed = new Set<unknown>();
  const out: Record<string, unknown>[] = [];
  let pending = rows;
  for (;;) {
    const next: Record<string, unknown>[] = [];
    for (const row of pending) {
      const ready = selfReferences.every(({ column }) => {
        const target = row[column];
        return target === null || target === undefined || placed.has(target);
      });
      if (ready) {
        out.push(row);
        for (const { references } of selfReferences)
          placed.add(row[references]);
      } else {
        next.push(row);
      }
    }
    if (next.length === 0 || next.length === pending.length) {
      return [...out, ...next];
    }
    pending = next;
  }
}
