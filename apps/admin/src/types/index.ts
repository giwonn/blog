export interface ApiResponse<T> {
  data: T;
}

export interface Article {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";
  password: string | null;
  publishedAt: string | null;
  seriesId: number | null;
  orderInSeries: number | null;
  bookId: number | null;
  orderInBook: number | null;
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

export interface Series {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesDetail {
  series: Series;
  articles: Article[];
}

export interface Book {
  id: number;
  title: string;
  slug: string;
  author: string;
  publisher: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  isbn: string | null;
  readStartDate: string | null;
  readEndDate: string | null;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookDetail {
  book: Book;
  articles: Article[];
}
