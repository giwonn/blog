import { BusinessError } from "../../errors";
import * as repo from "./repo";
import type { Series, SeriesRequest } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export async function findAll(): Promise<Series[]> {
  return await repo.findAll();
}

export async function findById(id: number): Promise<Series> {
  const series = await repo.findById(id);
  if (!series) throw BusinessError.from("SERIES_NOT_FOUND");
  return series;
}

export async function findBySlug(slug: string): Promise<Series> {
  const series = await repo.findBySlug(slug);
  if (!series) throw BusinessError.from("SERIES_NOT_FOUND");
  return series;
}

export async function create(req: SeriesRequest): Promise<Series> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("SERIES_SLUG_DUPLICATE");
  }
  return await repo.insert(req, nowIso());
}

export async function update(id: number, req: SeriesRequest): Promise<Series> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("SERIES_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("SERIES_SLUG_DUPLICATE");
    }
  }
  return await repo.update(id, req, nowIso());
}

export async function deleteSeries(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("SERIES_NOT_FOUND");
  await repo.deleteById(id);
}
