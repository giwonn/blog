import { z } from "zod";

export const BlogConfigSchema = z.object({
  name: z.string().default("Blog"),
  description: z.string().default(""),
  profileImage: z.string().nullable().default(null),
});

export const AnalyticsConfigSchema = z.object({
  trackingEnabled: z.boolean().default(true),
});

export const SiteSettingsSchema = z.object({
  blog: BlogConfigSchema.default({
    name: "Blog",
    description: "",
    profileImage: null,
  }),
  analytics: AnalyticsConfigSchema.default({
    trackingEnabled: true,
  }),
});

export type BlogConfig = z.infer<typeof BlogConfigSchema>;
export type AnalyticsConfig = z.infer<typeof AnalyticsConfigSchema>;
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
