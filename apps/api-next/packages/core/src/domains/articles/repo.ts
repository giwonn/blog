import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { db, schema } from "../../db/client";
import { type Article, type ArticleStatus, VISIBLE_STATUSES } from "./types";
import type { ArticleNeighbor, ArticleNeighbors, ArticleFilter, ArticleRequest } from "./types";
import type { Page } from "../../pagination";
import { makePage } from "../../pagination";

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

function toRow(req: ArticleRequest, publishedAt: string | null, now: string) {
  return {
    title: req.title,
    slug: req.slug,
    content: req.content,
    status: req.status,
    password: req.password,
    series_id: req.seriesId,
    order_in_series: req.orderInSeries,
    book_id: req.bookId,
    order_in_book: req.orderInBook,
    published_at: publishedAt,
    created_at: now,
    updated_at: now,
  };
}

export async function findById(id: number): Promise<Article | null> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, id));
  castStatus(rows);
  return (rows[0] ?? null) as Article | null;
}

export async function findBySlug(slug: string): Promise<Article | null> {
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(eq(schema.articles.slug, slug));
  castStatus(rows);
  return (rows[0] ?? null) as Article | null;
}

export async function existsBySlug(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.articles.id })
    .from(schema.articles)
    .where(eq(schema.articles.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function existsBySlugExcludingId(slug: string, excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.articles.id })
    .from(schema.articles)
    .where(and(eq(schema.articles.slug, slug), ne(schema.articles.id, excludeId)))
    .limit(1);
  return rows.length > 0;
}

export async function findAllPaginated(pageNumber: number, pageSize: number): Promise<Page<Article>> {
  const offset = pageNumber * pageSize;
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .orderBy(desc(schema.articles.created_at))
    .limit(pageSize)
    .offset(offset);
  castStatus(rows);
  const totalRow = await db.select({ n: count() }).from(schema.articles);
  const totalElements = totalRow[0]?.n ?? 0;
  return makePage(rows as Article[], totalElements, pageNumber, pageSize);
}

export async function findVisibleByFilterPaginated(
  filter: ArticleFilter,
  pageNumber: number,
  pageSize: number,
): Promise<Page<Article>> {
  const offset = pageNumber * pageSize;
  const visibilityClause = inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]);
  let whereClause;
  switch (filter) {
    case "series":
      whereClause = and(visibilityClause, isNotNull(schema.articles.series_id));
      break;
    case "book":
      whereClause = and(visibilityClause, isNotNull(schema.articles.book_id));
      break;
    case "standalone":
      whereClause = and(
        visibilityClause,
        isNull(schema.articles.series_id),
        isNull(schema.articles.book_id),
      );
      break;
    case "all":
    default:
      whereClause = visibilityClause;
      break;
  }
  const rows = await db
    .select(articleColumns)
    .from(schema.articles)
    .where(whereClause)
    .orderBy(desc(schema.articles.published_at))
    .limit(pageSize)
    .offset(offset);
  castStatus(rows);
  const totalRow = await db.select({ n: count() }).from(schema.articles).where(whereClause);
  const totalElements = totalRow[0]?.n ?? 0;
  return makePage(rows as Article[], totalElements, pageNumber, pageSize);
}

export async function insert(req: ArticleRequest, publishedAt: string | null, now: string): Promise<Article> {
  const inserted = await db
    .insert(schema.articles)
    .values(toRow(req, publishedAt, now))
    .returning(articleColumns);
  const rows = inserted as { status: string }[];
  castStatus(rows);
  return inserted[0] as Article;
}

export async function update(
  id: number,
  req: ArticleRequest,
  publishedAt: string | null,
  now: string,
): Promise<Article> {
  const updated = await db
    .update(schema.articles)
    .set({
      title: req.title,
      slug: req.slug,
      content: req.content,
      status: req.status,
      password: req.password,
      series_id: req.seriesId,
      order_in_series: req.orderInSeries,
      book_id: req.bookId,
      order_in_book: req.orderInBook,
      published_at: publishedAt,
      updated_at: now,
    })
    .where(eq(schema.articles.id, id))
    .returning(articleColumns);
  const rows = updated as { status: string }[];
  castStatus(rows);
  return updated[0] as Article;
}

export async function deleteById(id: number): Promise<void> {
  await db.delete(schema.articles).where(eq(schema.articles.id, id));
}

const neighborColumns = {
  id: schema.articles.id,
  title: schema.articles.title,
  slug: schema.articles.slug,
};

export async function findNeighborsByPublishedAt(article: Article): Promise<ArticleNeighbors> {
  if (article.publishedAt === null) {
    return { previous: null, next: null };
  }
  const previousRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        lt(schema.articles.published_at, article.publishedAt),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(desc(schema.articles.published_at))
    .limit(1);
  const nextRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        gt(schema.articles.published_at, article.publishedAt),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(asc(schema.articles.published_at))
    .limit(1);
  return {
    previous: (previousRows[0] as ArticleNeighbor | undefined) ?? null,
    next: (nextRows[0] as ArticleNeighbor | undefined) ?? null,
  };
}

export async function findNeighborsInSeries(article: Article): Promise<ArticleNeighbors> {
  if (article.seriesId === null || article.orderInSeries === null) {
    return { previous: null, next: null };
  }
  const previousRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.series_id, article.seriesId),
        lt(schema.articles.order_in_series, article.orderInSeries),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(desc(schema.articles.order_in_series))
    .limit(1);
  const nextRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.series_id, article.seriesId),
        gt(schema.articles.order_in_series, article.orderInSeries),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(asc(schema.articles.order_in_series))
    .limit(1);
  return {
    previous: (previousRows[0] as ArticleNeighbor | undefined) ?? null,
    next: (nextRows[0] as ArticleNeighbor | undefined) ?? null,
  };
}

export async function findNeighborsInBook(article: Article): Promise<ArticleNeighbors> {
  if (article.bookId === null || article.orderInBook === null) {
    return { previous: null, next: null };
  }
  const previousRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.book_id, article.bookId),
        lt(schema.articles.order_in_book, article.orderInBook),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(desc(schema.articles.order_in_book))
    .limit(1);
  const nextRows = await db
    .select(neighborColumns)
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.book_id, article.bookId),
        gt(schema.articles.order_in_book, article.orderInBook),
        inArray(schema.articles.status, VISIBLE_STATUSES as unknown as string[]),
        ne(schema.articles.id, article.id),
      ),
    )
    .orderBy(asc(schema.articles.order_in_book))
    .limit(1);
  return {
    previous: (previousRows[0] as ArticleNeighbor | undefined) ?? null,
    next: (nextRows[0] as ArticleNeighbor | undefined) ?? null,
  };
}
