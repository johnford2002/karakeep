import { db } from "./drizzle";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import serverConfig from "@karakeep/shared/config";

const dbType = serverConfig.database.type;

if (dbType === "postgres") {
  migratePostgres(db, { migrationsFolder: "./drizzle-postgres" });
} else {
  migrateSqlite(db, { migrationsFolder: "./drizzle" });
}
