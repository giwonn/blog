import { BusinessError } from "../../errors";
import * as repo from "./repo";
import type { Book, BookRequest } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export async function findAll(): Promise<Book[]> {
  return await repo.findAll();
}

export async function findById(id: number): Promise<Book> {
  const book = await repo.findById(id);
  if (!book) throw BusinessError.from("BOOK_NOT_FOUND");
  return book;
}

export async function findBySlug(slug: string): Promise<Book> {
  const book = await repo.findBySlug(slug);
  if (!book) throw BusinessError.from("BOOK_NOT_FOUND");
  return book;
}

export async function create(req: BookRequest): Promise<Book> {
  if (await repo.existsBySlug(req.slug)) {
    throw BusinessError.from("BOOK_SLUG_DUPLICATE");
  }
  return await repo.insert(req, nowIso());
}

export async function update(id: number, req: BookRequest): Promise<Book> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("BOOK_NOT_FOUND");
  if (req.slug !== existing.slug) {
    if (await repo.existsBySlugExcludingId(req.slug, id)) {
      throw BusinessError.from("BOOK_SLUG_DUPLICATE");
    }
  }
  return await repo.update(id, req, nowIso());
}

export async function deleteBook(id: number): Promise<void> {
  const existing = await repo.findById(id);
  if (!existing) throw BusinessError.from("BOOK_NOT_FOUND");
  await repo.deleteById(id);
}
