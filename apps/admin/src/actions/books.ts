'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api';
import type { Book, BookDetail } from '@/types';

export async function getBookList(): Promise<Book[]> {
  return apiClient<Book[]>('/admin/books');
}

export async function getBook(id: number): Promise<BookDetail> {
  return apiClient<BookDetail>(`/admin/books/${id}`);
}

export async function createBook(data: {
  title: string;
  slug: string;
  author: string;
  publisher?: string;
  thumbnailUrl?: string;
  description?: string;
  isbn?: string;
  readStartDate?: string;
  readEndDate?: string;
  rating?: number;
}): Promise<Book> {
  const b = await apiClient<Book>('/admin/books', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  revalidatePath('/books', 'layout');
  return b;
}

export async function updateBook(
  id: number,
  data: {
    title: string;
    slug: string;
    author: string;
    publisher?: string;
    thumbnailUrl?: string;
    description?: string;
    isbn?: string;
    readStartDate?: string;
    readEndDate?: string;
    rating?: number;
  }
): Promise<Book> {
  const b = await apiClient<Book>(`/admin/books/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  revalidatePath('/books', 'layout');
  return b;
}

export async function deleteBook(id: number): Promise<void> {
  await apiClient<void>(`/admin/books/${id}`, { method: 'DELETE' });
  revalidatePath('/books', 'layout');
}
