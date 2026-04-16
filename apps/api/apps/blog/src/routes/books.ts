import { Hono } from "hono";
import {
  bookFindAll,
  bookFindBySlug,
  articlesFindVisibleByBookId,
  type Book,
} from "@api/core";

type BookWithArticleCount = {
  id: number;
  title: string;
  slug: string;
  author: string;
  thumbnailUrl: string | null;
  rating: number | null;
  articleCount: number;
};

export const booksRoute = new Hono();

booksRoute.get("/", async (c) => {
  const books = await bookFindAll();
  // N+1 mirrors Kotlin behavior. Optimization deferred to a later plan.
  const data: BookWithArticleCount[] = await Promise.all(
    books.map(async (book: Book) => {
      const articles = await articlesFindVisibleByBookId(book.id);
      return {
        id: book.id,
        title: book.title,
        slug: book.slug,
        author: book.author,
        thumbnailUrl: book.thumbnailUrl,
        rating: book.rating,
        articleCount: articles.length,
      };
    }),
  );
  return c.json({ data });
});

booksRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const book = await bookFindBySlug(slug);
  const articles = await articlesFindVisibleByBookId(book.id);
  return c.json({ data: { book, articles } });
});
