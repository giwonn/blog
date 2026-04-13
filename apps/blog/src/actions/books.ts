"use server";

import { apiClient } from "@/lib/api";
import type { BookListItem, BookDetail } from "@/types";

export async function getBookList(): Promise<BookListItem[]> {
  return apiClient<BookListItem[]>("/books");
}

export async function getBookDetail(slug: string): Promise<BookDetail | null> {
  try {
    return await apiClient<BookDetail>(`/books/${slug}`);
  } catch {
    return null;
  }
}
