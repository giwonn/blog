import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  SeriesRequestSchema,
  seriesFindAll,
  seriesFindById,
  seriesCreate,
  seriesUpdate,
  seriesDelete,
  articlesFindAllBySeriesId,
  articleFindById,
  articleUpdate,
} from "@api/core";

// Local copy of the Plan B/C Zod-error → message mapper. Extraction to a
// shared module is still deferred per Plan A spec.
type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const articleOrderRequestSchema = z.object({
  articleIds: z.array(z.number().int().positive()),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const seriesAdminRoute = new Hono();

seriesAdminRoute.get("/", async (c) => {
  const data = await seriesFindAll();
  return c.json({ data });
});

seriesAdminRoute.get(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const series = await seriesFindById(id);
    const articles = await articlesFindAllBySeriesId(id);
    return c.json({ data: { series, articles } });
  },
);

seriesAdminRoute.post(
  "/",
  zValidator("json", SeriesRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await seriesCreate(c.req.valid("json"));
    return c.json({ data }, 201);
  },
);

seriesAdminRoute.put(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", SeriesRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await seriesUpdate(id, c.req.valid("json"));
    return c.json({ data });
  },
);

seriesAdminRoute.delete(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await seriesDelete(id);
    return c.body(null, 204);
  },
);

seriesAdminRoute.put(
  "/:id/article-order",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", articleOrderRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id: seriesId } = c.req.valid("param");
    const { articleIds } = c.req.valid("json");
    await seriesFindById(seriesId);
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i]!;
      const article = await articleFindById(articleId);
      await articleUpdate(articleId, {
        title: article.title,
        slug: article.slug,
        content: article.content,
        status: article.status,
        password: article.password,
        seriesId,
        orderInSeries: i + 1,
        bookId: article.bookId,
        orderInBook: article.orderInBook,
      });
    }
    return c.json({ data: "Article order updated successfully" });
  },
);
