import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ArticleRequestSchema,
  AdminArticleListQuerySchema,
  articleFindAll,
  articleFindById,
  articleCreate,
  articleUpdate,
  articleDelete,
} from "@api/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const articlesAdminRoute = new Hono();

articlesAdminRoute.get(
  "/",
  zValidator("query", AdminArticleListQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { page, size } = c.req.valid("query");
    const data = await articleFindAll(page, size);
    return c.json({ data });
  },
);

articlesAdminRoute.get(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await articleFindById(id);
    return c.json({ data });
  },
);

articlesAdminRoute.post(
  "/",
  zValidator("json", ArticleRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await articleCreate(c.req.valid("json"));
    return c.json({ data }, 201);
  },
);

articlesAdminRoute.put(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", ArticleRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await articleUpdate(id, c.req.valid("json"));
    return c.json({ data });
  },
);

articlesAdminRoute.delete(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await articleDelete(id);
    return c.body(null, 204);
  },
);
