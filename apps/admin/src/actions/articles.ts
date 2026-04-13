'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api';
import type { Article, PageResponse } from '@/types';

const IMAGE_PUBLIC_URL = process.env.IMAGE_PUBLIC_URL || 'http://localhost:8080/images';

function restoreImageUrls(content: string): string {
  return content.replaceAll('/api/images/', `${IMAGE_PUBLIC_URL}/`);
}

function proxyImageUrls(content: string): string {
  return content.replaceAll(`${IMAGE_PUBLIC_URL}/`, '/api/images/');
}

export async function getArticles(
  page: number = 0,
  size: number = 10
): Promise<PageResponse<Article>> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('size', String(size));
  return apiClient<PageResponse<Article>>(`/admin/articles?${params.toString()}`);
}

export async function getArticle(id: number): Promise<Article> {
  const article = await apiClient<Article>(`/admin/articles/${id}`);
  return { ...article, content: proxyImageUrls(article.content) };
}

export async function createArticle(data: {
  title: string;
  slug: string;
  content: string;
  status: string;
  password?: string | null;
  seriesId?: number | null;
  bookId?: number | null;
}): Promise<Article> {
  const article = await apiClient<Article>('/admin/articles', {
    method: 'POST',
    body: JSON.stringify({ ...data, content: restoreImageUrls(data.content) }),
  });
  revalidatePath('/articles', 'layout');
  return article;
}

export async function updateArticle(
  id: number,
  data: {
    title: string;
    slug: string;
    content: string;
    status: string;
    password?: string | null;
    seriesId?: number | null;
    bookId?: number | null;
  }
): Promise<Article> {
  const article = await apiClient<Article>(`/admin/articles/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...data, content: restoreImageUrls(data.content) }),
  });
  revalidatePath('/articles', 'layout');
  return article;
}

export async function deleteArticle(id: number): Promise<void> {
  await apiClient<void>(`/admin/articles/${id}`, {
    method: 'DELETE',
  });
  revalidatePath('/articles', 'layout');
}

export async function uploadImage(formData: FormData): Promise<{ url: string }> {
  const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8081';
  const res = await fetch(`${API_BASE_URL}/admin/images`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: '이미지 업로드에 실패했습니다' }));
    throw new Error(error.message);
  }

  const json = await res.json();
  const { url } = json.data as { url: string };
  return { url: url.replace(IMAGE_PUBLIC_URL, '/api/images') };
}
