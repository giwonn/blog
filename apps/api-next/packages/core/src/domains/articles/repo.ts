import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db/client";
import { type Article, type ArticleStatus, VISIBLE_STATUSES } from "./types";

const articleColumns = {
  id: schema.articles.id,
  title: schema.articles.title,
  slug: schema.articles.slug,
  content: schema.articles.content,
  status: schema.articles.status,
  password: schema.articles.password,
  seriesId: schema.articles.series_id,
  orderInSeries: schema.articles.order_in_series,
  bookId: schema.articles.book_id,
  orderInBook: schema.articles.order_in_book,
  publishedAt: schema.articles.published_at,
  createdAt: schema.articles.created_at,
  updatedAt: schema.articles.updated_at,
};

function castStatus(rows: { status: string }[]): void {
  // The drizzle column is typed as `string` because the introspected schema uses
  // varchar with a CHECK constraint. We narrow to ArticleStatus at the boundary.
  for (const r of rows) {
    if (!["DRAFT", "PUBLIC", "LOCKED", "PRIVATE"].includes(r.status)) {
      throw new Error(`Unexpected article status: ${r.status}`);
    }
  }
}

export async function findVisibleByBookId(bookId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.book_id, bookId),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
      ),
    );
  castStatus(rows);
  return rows as Article[];
}

export async function findAllByBookId(bookId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.book_id, bookId))
    .orderBy(asc(schema.articles.order_in_book));
  castStatus(rows);
  return rows as Article[];
}

export async function findVisibleBySeriesId(seriesId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.series_id, seriesId),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
      ),
    );
  castStatus(rows);
  return rows as Article[];
}

export async function findAllBySeriesId(seriesId: number): Promise<Article[]> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.series_id, seriesId))
    .orderBy(asc(schema.articles.order_in_series));
  castStatus(rows);
  return rows as Article[];
}

export type { ArticleStatus };
