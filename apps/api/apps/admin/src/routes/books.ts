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
  articleFindById,
  articleUpdate,
} from "@api/core";

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

const articleOrderRequestSchema = z.object({
  articleIds: z.array(z.number().int().positive()),
});

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

booksAdminRoute.put(
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
    const { id: bookId } = c.req.valid("param");
    const { articleIds } = c.req.valid("json");
    // Verify the book exists; throws BOOK_NOT_FOUND otherwise.
    await bookFindById(bookId);
    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i]!;
      const article = await articleFindById(articleId);
      await articleUpdate(articleId, {
        title: article.title,
        slug: article.slug,
        content: article.content,
        status: article.status,
        password: article.password,
        seriesId: article.seriesId,
        orderInSeries: article.orderInSeries,
        bookId,
        orderInBook: i + 1,
      });
    }
    return c.json({ data: "Article order updated successfully" });
  },
);
