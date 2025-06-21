import "dotenv/config";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import Database from "better-sqlite3";
import postgres from "postgres";
import * as sqliteSchema from "./schema";
import * as postgresSchema from "./schema-postgres";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import serverConfig from "@karakeep/shared/config";

// Determine database type and create appropriate connection
const dbType = serverConfig.database.type;

let db: any;
let schema: any;

if (dbType === "postgres") {
  // PostgreSQL connection
  const connectionString = serverConfig.database.url || 
    `postgresql://${serverConfig.database.user}:${serverConfig.database.password}@${serverConfig.database.host}:${serverConfig.database.port}/${serverConfig.database.name}`;
  
  const sql = postgres(connectionString);
  db = drizzlePostgres(sql, { schema: postgresSchema });
  schema = postgresSchema;
} else {
  // SQLite connection (default)
  const databaseURL = serverConfig.dataDir
    ? `${serverConfig.dataDir}/db.db`
    : "./db.db";
  
  const sqlite = new Database(databaseURL);
  db = drizzleSqlite(sqlite, { schema: sqliteSchema });
  schema = sqliteSchema;
}

export { db, schema };
export type DB = typeof db;

export function getInMemoryDB(runMigrations: boolean) {
  const mem = new Database(":memory:");
  const db = drizzleSqlite(mem, { schema: sqliteSchema, logger: false });
  if (runMigrations) {
    migrateSqlite(db, { migrationsFolder: path.resolve(__dirname, "./drizzle") });
  }
  return db;
}
