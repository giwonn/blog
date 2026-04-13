import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { env } from "@api-next/core";

declare module "hono" {
  interface ContextVariableMap {
    userSub: string;
  }
}

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);
const allowlist = new Set(env.ADMIN_GOOGLE_SUB);

export const jwtAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub || !allowlist.has(sub)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    c.set("userSub", sub);
    await next();
    return;
  } catch {
    return c.json({ message: "Unauthorized" }, 401);
  }
};
