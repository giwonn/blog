import { z } from "zod";

export const BookRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  author: z.string().min(1),
  publisher: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  isbn: z.string().nullable().default(null),
  readStartDate: z.string().date().nullable().default(null),
  readEndDate: z.string().date().nullable().default(null),
  rating: z.number().int().min(1).max(5).nullable().default(null),
});

export type BookRequest = z.infer<typeof BookRequestSchema>;

export type Book = BookRequest & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
