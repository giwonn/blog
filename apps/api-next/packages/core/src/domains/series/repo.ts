import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "../../db/client";
import type { Series, SeriesRequest } from "./types";

const seriesColumns = {
  id: schema.series.id,
  title: schema.series.title,
  slug: schema.series.slug,
  description: schema.series.description,
  thumbnailUrl: schema.series.thumbnail_url,
  createdAt: schema.series.created_at,
  updatedAt: schema.series.updated_at,
};

function toRow(req: SeriesRequest): {
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
} {
  return {
    title: req.title,
    slug: req.slug,
    description: req.description,
    thumbnail_url: req.thumbnailUrl,
  };
}

export async function findAll(): Promise<Series[]> {
  return await db.select(seriesColumns).from(schema.series);
}

export async function findById(id: number): Promise<Series | null> {
  const rows = await db.select(seriesColumns).from(schema.series).where(eq(schema.series.id, id));
  return rows[0] ?? null;
}

export async function findBySlug(slug: string): Promise<Series | null> {
  const rows = await db.select(seriesColumns).from(schema.series).where(eq(schema.series.slug, slug));
  return rows[0] ?? null;
}

export async function existsBySlug(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.series.id })
    .from(schema.series)
    .where(eq(schema.series.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export async function existsBySlugExcludingId(slug: string, excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.series.id })
    .from(schema.series)
    .where(and(eq(schema.series.slug, slug), ne(schema.series.id, excludeId)))
    .limit(1);
  return rows.length > 0;
}

export async function insert(req: SeriesRequest, now: string): Promise<Series> {
  const inserted = await db
    .insert(schema.series)
    .values({ ...toRow(req), created_at: now, updated_at: now })
    .returning(seriesColumns);
  return inserted[0]!;
}

export async function update(id: number, req: SeriesRequest, now: string): Promise<Series> {
  const updated = await db
    .update(schema.series)
    .set({ ...toRow(req), updated_at: now })
    .where(eq(schema.series.id, id))
    .returning(seriesColumns);
  return updated[0]!;
}

export async function deleteById(id: number): Promise<void> {
  await db.delete(schema.series).where(eq(schema.series.id, id));
}
