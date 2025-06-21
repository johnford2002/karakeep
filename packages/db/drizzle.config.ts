import "dotenv/config";
import type { Config } from "drizzle-kit";
import serverConfig from "@karakeep/shared/config";

const dbType = serverConfig.database.type;

let config: Config;

if (dbType === "postgres") {
  // PostgreSQL configuration
  const connectionString = serverConfig.database.url || 
    `postgresql://${serverConfig.database.user}:${serverConfig.database.password}@${serverConfig.database.host}:${serverConfig.database.port}/${serverConfig.database.name}`;

  config = {
    dialect: "postgresql",
    schema: "./schema-postgres.ts",
    out: "./drizzle-postgres",
    dbCredentials: {
      url: connectionString,
    },
  } satisfies Config;
} else {
  // SQLite configuration (default)
  const databaseURL = serverConfig.dataDir
    ? `${serverConfig.dataDir}/db.db`
    : "./db.db";

  config = {
    dialect: "sqlite",
    schema: "./schema.ts",
    out: "./drizzle",
    dbCredentials: {
      url: databaseURL,
    },
  } satisfies Config;
}

export default config;
