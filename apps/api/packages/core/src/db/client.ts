import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "../env";
import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });
export type DB = typeof db;
export { schema };
