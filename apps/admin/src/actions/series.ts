'use server';

import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api';
import type { Series, SeriesDetail } from '@/types';

export async function getSeriesList(): Promise<Series[]> {
  return apiClient<Series[]>('/admin/series');
}

export async function getSeries(id: number): Promise<SeriesDetail> {
  return apiClient<SeriesDetail>(`/admin/series/${id}`);
}

export async function createSeries(
  title: string,
  slug: string,
  description?: string,
  thumbnailUrl?: string
): Promise<Series> {
  const s = await apiClient<Series>('/admin/series', {
    method: 'POST',
    body: JSON.stringify({ title, slug, description, thumbnailUrl }),
  });
  revalidatePath('/series', 'layout');
  return s;
}

export async function updateSeries(
  id: number,
  title: string,
  slug: string,
  description?: string,
  thumbnailUrl?: string
): Promise<Series> {
  const s = await apiClient<Series>(`/admin/series/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title, slug, description, thumbnailUrl }),
  });
  revalidatePath('/series', 'layout');
  return s;
}

export async function deleteSeries(id: number): Promise<void> {
  await apiClient<void>(`/admin/series/${id}`, { method: 'DELETE' });
  revalidatePath('/series', 'layout');
}
