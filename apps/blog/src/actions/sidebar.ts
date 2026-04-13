"use server";

import { apiClient } from "@/lib/api";
import type { PopularArticle, RecentComment, VisitorSummary } from "@/types";

export async function getPopularArticles(): Promise<PopularArticle[]> {
  try {
    return await apiClient<PopularArticle[]>("/sidebar/popular-articles");
  } catch {
    return [];
  }
}

export async function getRecentComments(): Promise<RecentComment[]> {
  try {
    return await apiClient<RecentComment[]>("/sidebar/recent-comments");
  } catch {
    return [];
  }
}

export async function getVisitorSummary(): Promise<VisitorSummary> {
  try {
    return await apiClient<VisitorSummary>("/sidebar/visitors");
  } catch {
    return { total: 0, today: 0, yesterday: 0 };
  }
}
