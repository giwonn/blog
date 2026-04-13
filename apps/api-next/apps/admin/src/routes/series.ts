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
} from "@api-next/core";

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
