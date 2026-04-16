import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "../../db/client";
import type { Book, BookRequest } from "./types";

const bookColumns = {
  id: schema.books.id,
  title: schema.books.title,
  slug: schema.books.slug,
  author: schema.books.author,
  publisher: schema.books.publisher,
  thumbnailUrl: schema.books.thumbnail_url,
  description: schema.books.description,
  isbn: schema.books.isbn,
  readStartDate: schema.books.read_start_date,
  readEndDate: schema.books.read_end_date,
  rating: schema.books.rating,
  createdAt: schema.books.created_at,
  updatedAt: schema.books.updated_at,
};

function toRow(req: BookRequest): {
  title: string;
  slug: string;
  author: string;
  publisher: string | null;
  thumbnail_url: string | null;
  description: string | null;
  isbn: string | null;
  read_start_date: string | null;
  read_end_date: string | null;
  rating: number | null;
} {
  return {
    title: req.title,
    slug: req.slug,
    author: req.author,
    publisher: req.publisher,
    thumbnail_url: req.thumbnailUrl,
    description: req.description,
    isbn: req.isbn,
    read_start_date: req.readStartDate,
    read_end_date: req.readEndDate,
    rating: req.rating,
  };
}

export async function findAll(): Promise<Book[]> {
  return await db.select(bookColumns).from(schema.books);
}

export async function findById(id: number): Promise<Book | null> {
  const rows = await db.select(bookColumns).from(schema.books).where(eq(schema.books.id, id));
  return rows[0] ?? null;
}

export async function findBySlug(slug: string): Promise<Book | null> {
  const rows = await db.select(bookColumns).from(schema.books).where(eq(schema.books.slug, slug));
  return rows[0] ?? null;
}

export async function existsBySlug(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .where(eq(schema.books.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function existsBySlugExcludingId(slug: string, excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .where(and(eq(schema.books.slug, slug), ne(schema.books.id, excludeId)))
    .limit(1);
  return rows.length > 0;
}

export async function insert(req: BookRequest, now: string): Promise<Book> {
  const inserted = await db
    .insert(schema.books)
    .values({ ...toRow(req), created_at: now, updated_at: now })
    .returning(bookColumns);
  return inserted[0]!;
}

export async function update(id: number, req: BookRequest, now: string): Promise<Book> {
  const updated = await db
    .update(schema.books)
    .set({ ...toRow(req), updated_at: now })
    .where(eq(schema.books.id, id))
    .returning(bookColumns);
  return updated[0]!;
}

export async function deleteById(id: number): Promise<void> {
  await db.delete(schema.books).where(eq(schema.books.id, id));
}
