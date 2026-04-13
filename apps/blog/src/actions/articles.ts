"use server";

import { apiClient } from "@/lib/api";
import type { Article as ApiArticle, PageResponse, ArticleNeighbors } from "@/types";

const IMAGE_PUBLIC_URL = process.env.IMAGE_PUBLIC_URL || 'http://localhost:8080/images';

function proxyImageUrls(content: string): string {
  return content.replaceAll(`${IMAGE_PUBLIC_URL}/`, '/api/images/');
}

export interface ArticleSummary {
  id: number;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  seriesId: number | null;
  bookId: number | null;
}

export interface Article extends ArticleSummary {
  content: string;
}

function toArticleSummary(article: ApiArticle): ArticleSummary {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    date: article.publishedAt
      ? new Date(article.publishedAt).toLocaleDateString("ko-KR")
      : new Date(article.createdAt).toLocaleDateString("ko-KR"),
    excerpt: article.content.substring(0, 150).replace(/[#*!\[\]()]/g, "") + "...",
    seriesId: article.seriesId,
    bookId: article.bookId,
  };
}

function toArticle(article: ApiArticle): Article {
  return {
    ...toArticleSummary(article),
    content: proxyImageUrls(article.content),
  };
}

export async function getArticleSummaries(filter: string = "all"): Promise<ArticleSummary[]> {
  const page = await apiClient<PageResponse<ApiArticle>>(`/articles?filter=${filter}&size=20`);
  return page.content.map(toArticleSummary);
}

export async function getArticle(slug: string): Promise<Article | null> {
  try {
    const article = await apiClient<ApiArticle>(`/articles/${slug}`);
    return toArticle(article);
  } catch {
    return null;
  }
}

export async function getArticleNeighbors(
  slug: string,
  seriesSlug?: string,
  bookSlug?: string
): Promise<ArticleNeighbors> {
  const params = new URLSearchParams();
  if (seriesSlug) params.set("series", seriesSlug);
  if (bookSlug) params.set("book", bookSlug);
  const query = params.toString();
  return apiClient<ArticleNeighbors>(`/articles/${slug}/neighbors${query ? `?${query}` : ""}`);
}
