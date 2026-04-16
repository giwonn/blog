import { eq } from "drizzle-orm";
import { db, schema } from "../../db/client";
import type { SiteSettings } from "./types";

const SETTINGS_ROW_ID = 1;

/**
 * Raw fetch of the JSONB config column. Returns `null` when no row exists.
 * Does not validate the shape — the service layer is responsible for that.
 */
export async function getSettingsConfig(): Promise<unknown | null> {
  const rows = await db
    .select({ config: schema.settings.config })
    .from(schema.settings)
    .where(eq(schema.settings.id, SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.config ?? null;
}

/**
 * Upserts the settings row. Single atomic SQL statement — no transaction
 * wrapper needed. The service layer calls this with a complete SiteSettings
 * object that has already been merged from a prior read.
 */
export async function saveSettings(settings: SiteSettings): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ id: SETTINGS_ROW_ID, config: settings })
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: { config: settings },
    });
}
