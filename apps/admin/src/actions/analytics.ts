"use server";

import { apiClient } from "@/lib/api";

const TZ = "Asia/Seoul";

export interface AnalyticsOverview {
  totalPageViews: number;
  uniqueVisitors: number;
}

export interface DailyPageViewCount {
  date: string;
  viewCount: number;
}

export interface PageViewCount {
  articleId: number;
  title: string;
  viewCount: number;
}

export interface ReferrerCount {
  referrer: string;
  viewCount: number;
}

export async function getOverview(from: string, to: string): Promise<AnalyticsOverview> {
  return apiClient<AnalyticsOverview>(`/admin/analytics/overview?from=${from}&to=${to}&tz=${TZ}`);
}

export async function getDailyPageViews(from: string, to: string): Promise<DailyPageViewCount[]> {
  return apiClient<DailyPageViewCount[]>(`/admin/analytics/page-views?from=${from}&to=${to}&tz=${TZ}`);
}

export interface DailyVisitorCount {
  date: string;
  visitorCount: number;
}

export async function getDailyVisitors(from: string, to: string): Promise<DailyVisitorCount[]> {
  return apiClient<DailyVisitorCount[]>(`/admin/analytics/daily-visitors?from=${from}&to=${to}&tz=${TZ}`);
}

export async function getTopPages(from: string, to: string): Promise<PageViewCount[]> {
  return apiClient<PageViewCount[]>(`/admin/analytics/top-pages?from=${from}&to=${to}&tz=${TZ}`);
}

export async function getTopReferrers(from: string, to: string): Promise<ReferrerCount[]> {
  return apiClient<ReferrerCount[]>(`/admin/analytics/referrers?from=${from}&to=${to}&tz=${TZ}`);
}

export interface PopularArticle {
  id: number;
  title: string;
  viewCount: number;
}

export async function getPopularArticles(): Promise<PopularArticle[]> {
  return apiClient<PopularArticle[]>(`/admin/dashboard/popular-articles`);
}

export interface VisitorLocation {
  ipAddress: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  visitCount: number;
  lastVisitedAt: string;
}

export async function getVisitorLocations(from: string, to: string): Promise<VisitorLocation[]> {
  return apiClient<VisitorLocation[]>(`/admin/analytics/visitor-locations?from=${from}&to=${to}&tz=${TZ}`);
}

export interface IpAccessHistory {
  path: string;
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
}

export async function getIpAccessHistory(ip: string, from: string, to: string): Promise<IpAccessHistory[]> {
  return apiClient<IpAccessHistory[]>(`/admin/analytics/ip-access-history?ip=${encodeURIComponent(ip)}&from=${from}&to=${to}&tz=${TZ}`);
}

export interface ArticleAccessHistory {
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
}

export async function getArticleAccessHistory(articleId: number, from: string, to: string): Promise<ArticleAccessHistory[]> {
  return apiClient<ArticleAccessHistory[]>(`/admin/analytics/article-access-history?articleId=${articleId}&from=${from}&to=${to}&tz=${TZ}`);
}
