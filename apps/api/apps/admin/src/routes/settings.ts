import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  BlogConfigSchema,
  AnalyticsConfigSchema,
  getSiteSettings,
  updateBlogConfig,
  updateAnalyticsConfig,
} from "@api/core";
// Maps a Zod error to the Plan A envelope shape `{ message: string }`.
// Other domains can import this helper once it graduates to a shared module,
// but for Plan B the duplication overhead is two lines per route so we keep
// it local. Typed structurally because Zod v4 split its error types into
// $ZodError (internal, used by zValidator's hook) and ZodError (public).
type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export const settingsRoute = new Hono();

settingsRoute.get("/", async (c) => {
  const data = await getSiteSettings();
  return c.json({ data });
});

settingsRoute.put(
  "/blog",
  zValidator("json", BlogConfigSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await updateBlogConfig(c.req.valid("json"));
    return c.json({ data });
  },
);

settingsRoute.put(
  "/analytics",
  zValidator("json", AnalyticsConfigSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await updateAnalyticsConfig(c.req.valid("json"));
    return c.json({ data });
  },
);
