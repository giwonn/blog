export interface ApiResponse<T> {
  data: T;
}

export interface Article {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  seriesId: number | null;
  orderInSeries: number | null;
  bookId: number | null;
  orderInBook: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageResponse<T> {
  content: T[];
  page: {
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}

export interface SeriesListItem {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  articleCount: number;
}

export interface SeriesDetail {
  series: { id: number; title: string; slug: string; description: string | null; thumbnailUrl: string | null; };
  articles: Article[];
}

export interface BookListItem {
  id: number;
  title: string;
  slug: string;
  author: string;
  thumbnailUrl: string | null;
  rating: number | null;
  articleCount: number;
}

export interface BookDetail {
  book: { id: number; title: string; slug: string; author: string; publisher: string | null; thumbnailUrl: string | null; description: string | null; rating: number | null; };
  articles: Article[];
}

export interface ArticleNeighbor {
  id: number;
  title: string;
  slug: string;
}

export interface ArticleNeighbors {
  previous: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
}

export interface PopularArticle {
  id: number;
  title: string;
  viewCount: number;
}

export interface RecentComment {
  body: string;
  author: string;
  avatarUrl: string;
  url: string;
  createdAt: string;
}

export interface VisitorSummary {
  total: number;
  today: number;
  yesterday: number;
}
