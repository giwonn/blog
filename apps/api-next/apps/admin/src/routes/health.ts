import { Hono } from "hono";
import { db, sql } from "@api-next/core";

export const healthRoute = new Hono();

healthRoute.get("/", async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ data: { status: "ok" } });
});
