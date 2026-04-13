export type ArticleStatus = "DRAFT" | "PUBLIC" | "LOCKED" | "PRIVATE";

export const VISIBLE_STATUSES: readonly ArticleStatus[] = ["PUBLIC", "LOCKED"];

// Camel-cased projection of the articles table row used by the API surface.
// Plan E will expand this with full Zod schemas for create/update bodies.
export type Article = {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: ArticleStatus;
  password: string | null;
  seriesId: number | null;
  orderInSeries: number | null;
  bookId: number | null;
  orderInBook: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
