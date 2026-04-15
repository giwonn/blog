import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  BLOG_PORT: z.coerce.number().int().positive().default(8080),
  ADMIN_PORT: z.coerce.number().int().positive().default(8081),
  GITHUB_OWNER: z.string().default("giwonn"),
  GITHUB_REPO: z.string().default("giwon-blog"),
  REDIS_URL: z.string().default("redis://localhost:6380"),
  IMAGE_STORAGE_PATH: z.string().default("./storage/images"),
  IMAGE_PUBLIC_URL: z.string().default("http://localhost:8081/images"),
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

// Lazy cache: tests and preload scripts can mutate process.env before first read.
let cached: Env | undefined;
function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Test-only helper: clears the cached env so the next access re-parses process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}

// Proxy lets call sites keep using `env.X` while deferring the parse until first access.
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return (getEnv() as Record<string, unknown>)[prop as string];
  },
  has(_target, prop) {
    return prop in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv() as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Object.getOwnPropertyDescriptor(getEnv(), prop);
  },
});
