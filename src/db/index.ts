import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as unknown as {
  futureBankPool?: Pool;
  futureBankPoolAttached?: boolean;
};

export const pool = globalForDb.futureBankPool ?? new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
});

if (process.env.NODE_ENV !== "production") globalForDb.futureBankPool = pool;

if (!globalForDb.futureBankPoolAttached) {
  attachDatabasePool(pool);
  globalForDb.futureBankPoolAttached = true;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export { schema };
