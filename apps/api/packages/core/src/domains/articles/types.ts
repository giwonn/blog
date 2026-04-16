import { z } from "zod";

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

export const ArticleStatusSchema = z.enum(["DRAFT", "PUBLIC", "LOCKED", "PRIVATE"]);

export const ArticleRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().min(1),
  status: ArticleStatusSchema.default("DRAFT"),
  password: z.string().nullable().default(null),
  seriesId: z.number().int().positive().nullable().default(null),
  orderInSeries: z.number().int().nullable().default(null),
  bookId: z.number().int().positive().nullable().default(null),
  orderInBook: z.number().int().nullable().default(null),
});

export type ArticleRequest = z.infer<typeof ArticleRequestSchema>;

export type ArticleNeighbor = {
  id: number;
  title: string;
  slug: string;
};

export type ArticleNeighbors = {
  previous: ArticleNeighbor | null;
  next: ArticleNeighbor | null;
};

export type ArticleFilter = "all" | "series" | "book" | "standalone";

export const ArticleListQuerySchema = z.object({
  filter: z.enum(["all", "series", "book", "standalone"]).default("all"),
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(10),
});

export const AdminArticleListQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(10),
});
