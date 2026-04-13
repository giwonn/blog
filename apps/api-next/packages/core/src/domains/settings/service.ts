import { getSettingsConfig, saveSettings } from "./repo";
import {
  SiteSettingsSchema,
  type BlogConfig,
  type AnalyticsConfig,
  type SiteSettings,
} from "./types";

/**
 * Returns the current site settings, falling back to schema defaults when no
 * row exists or when the stored JSONB fails schema validation (e.g. legacy
 * row from before a schema change). A validation fallback is logged but not
 * thrown so the admin UI stays usable.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  const raw = await getSettingsConfig();
  if (raw === null) {
    return SiteSettingsSchema.parse({});
  }
  const parsed = SiteSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      "[settings] stored config failed SiteSettingsSchema validation, returning defaults",
      parsed.error.flatten(),
    );
    return SiteSettingsSchema.parse({});
  }
  return parsed.data;
}

export async function updateBlogConfig(blog: BlogConfig): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next: SiteSettings = { ...current, blog };
  await saveSettings(next);
  return next;
}

export async function updateAnalyticsConfig(
  analytics: AnalyticsConfig,
): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next: SiteSettings = { ...current, analytics };
  await saveSettings(next);
  return next;
}
