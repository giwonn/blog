import { z } from "zod";

export type PopularArticle = {
  id: number;
  title: string;
  viewCount: number;
};

export type PageViewCount = {
  articleId: number;
  title: string;
  viewCount: number;
};

export type ReferrerCount = {
  referrer: string;
  viewCount: number;
};

export type DailyPageViewCount = {
  date: string;   // "YYYY-MM-DD"
  viewCount: number;
};

export type DailyVisitorCount = {
  date: string;
  visitorCount: number;
};

export type VisitorCount = {
  count: number;
};

export type VisitorLocation = {
  ipAddress: string;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  visitCount: number;
  lastVisitedAt: string;
};

export type IpAccessHistory = {
  path: string;
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
};

export type ArticleAccessHistory = {
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
};

export type AnalyticsOverview = {
  totalPageViews: number;
  topPages: PageViewCount[];
};

export type GeoLocation = {
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
};

export type VisitorSummary = {
  total: number;
  today: number;
  yesterday: number;
};

export const PageViewRequestSchema = z.object({
  path: z.string().min(1),
  ipAddress: z.string().min(1),
  userAgent: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
});

export type PageViewInput = z.infer<typeof PageViewRequestSchema>;
