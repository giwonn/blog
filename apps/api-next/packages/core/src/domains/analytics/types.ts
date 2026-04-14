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
