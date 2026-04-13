import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ADMIN_JWT_SECRET: z.string().min(32, "ADMIN_JWT_SECRET must be at least 32 chars"),
  ADMIN_GOOGLE_SUB: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  BLOG_PORT: z.coerce.number().int().positive().default(8080),
  ADMIN_PORT: z.coerce.number().int().positive().default(8081),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return result.data;
}

export const env = loadEnv();
