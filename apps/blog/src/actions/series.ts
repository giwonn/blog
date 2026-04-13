"use server";

import { apiClient } from "@/lib/api";
import type { SeriesListItem, SeriesDetail } from "@/types";

export async function getSeriesList(): Promise<SeriesListItem[]> {
  return apiClient<SeriesListItem[]>("/series");
}

export async function getSeriesDetail(slug: string): Promise<SeriesDetail | null> {
  try {
    return await apiClient<SeriesDetail>(`/series/${slug}`);
  } catch {
    return null;
  }
}
