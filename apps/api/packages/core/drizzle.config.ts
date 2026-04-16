// drizzle-kit introspect writes into ./drizzle/ (gitignored). The useful output
// is `drizzle/schema.ts`, which must be copied to `./src/db/schema.ts` by hand
// after each introspect run (bun run db:introspect && cp drizzle/schema.ts src/db/schema.ts).
//
// drizzle-kit's introspect driver requires a classic Postgres driver (`pg`),
// which is why @api/core carries `pg` + `@types/pg` as devDependencies
// even though the runtime uses Bun's native `bun:sql` driver via
// `drizzle-orm/bun-sql` in src/db/client.ts.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  introspect: {
    casing: "preserve",
  },
});
