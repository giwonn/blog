import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ArticleListQuerySchema,
  articleFindVisibleByFilter,
  articleFindBySlugForBlog,
  articleFindNeighbors,
} from "@api-next/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export const articlesRoute = new Hono();

articlesRoute.get(
  "/",
  zValidator("query", ArticleListQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { filter, page, size } = c.req.valid("query");
    const data = await articleFindVisibleByFilter(filter, page, size);
    return c.json({ data });
  },
);

articlesRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const password = c.req.query("password") ?? null;
  const data = await articleFindBySlugForBlog(slug, password);
  return c.json({ data });
});

articlesRoute.get("/:slug/neighbors", async (c) => {
  const slug = c.req.param("slug");
  const seriesSlug = c.req.query("series") ?? null;
  const bookSlug = c.req.query("book") ?? null;
  const data = await articleFindNeighbors(slug, seriesSlug, bookSlug);
  return c.json({ data });
});
