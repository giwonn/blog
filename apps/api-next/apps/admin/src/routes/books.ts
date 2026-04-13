import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  BookRequestSchema,
  bookFindAll,
  bookFindById,
  bookCreate,
  bookUpdate,
  bookDelete,
  articlesFindAllByBookId,
} from "@api-next/core";

// Local copy of the Plan B Zod-error → message mapper. Kept inline until
// the shared middleware extraction (deferred per Plan A spec).
type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const booksAdminRoute = new Hono();

booksAdminRoute.get("/", async (c) => {
  const data = await bookFindAll();
  return c.json({ data });
});

booksAdminRoute.get(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const book = await bookFindById(id);
    const articles = await articlesFindAllByBookId(id);
    return c.json({ data: { book, articles } });
  },
);

booksAdminRoute.post(
  "/",
  zValidator("json", BookRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const data = await bookCreate(c.req.valid("json"));
    return c.json({ data }, 201);
  },
);

booksAdminRoute.put(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  zValidator("json", BookRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const data = await bookUpdate(id, c.req.valid("json"));
    return c.json({ data });
  },
);

booksAdminRoute.delete(
  "/:id",
  zValidator("param", idParamSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await bookDelete(id);
    return c.body(null, 204);
  },
);
