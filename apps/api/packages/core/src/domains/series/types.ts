import { z } from "zod";

export const SeriesRequestSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
});

export type SeriesRequest = z.infer<typeof SeriesRequestSchema>;

export type Series = SeriesRequest & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
