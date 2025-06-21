import Database from "better-sqlite3";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import serverConfig from "@karakeep/shared/config";

import * as sqliteSchema from "./schema";
import * as postgresSchema from "./schema-postgres";

export { db, schema } from "./drizzle";
export type { DB } from "./drizzle";
export { SqliteError } from "better-sqlite3";

// Export transaction types based on database type
const dbType = serverConfig.database.type;

export type KarakeepDBTransaction = 
  typeof dbType extends "postgres" 
    ? PostgresJsTransaction<typeof postgresSchema, ExtractTablesWithRelations<typeof postgresSchema>>
    : SQLiteTransaction<"sync", Database.RunResult, typeof sqliteSchema, ExtractTablesWithRelations<typeof sqliteSchema>>;
