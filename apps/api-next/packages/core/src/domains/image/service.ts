import { BusinessError } from "../../errors";
import { env } from "../../env";
import * as storage from "./storage";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;
const TYPE_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const TEMP_URL_PATTERN = /!\[([^\]]*)\]\((https?:\/\/[^)]*?\/temp\/[^)]+)\)/g;
const IMAGE_URL_PATTERN = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function uploadToTemp(
  data: Uint8Array,
  contentType: string,
): Promise<{ url: string }> {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw BusinessError.from("INVALID_IMAGE_TYPE");
  }
  if (data.length > MAX_SIZE) {
    throw BusinessError.from("IMAGE_TOO_LARGE");
  }
  const ext = TYPE_TO_EXT[contentType]!;
  const filename = `${crypto.randomUUID()}.${ext}`;
  await storage.write(`temp/${filename}`, data);
  return { url: `${env.IMAGE_PUBLIC_URL}/temp/${filename}` };
}

export async function processNewImages(content: string, articleId: number): Promise<string> {
  const matches = [...content.matchAll(TEMP_URL_PATTERN)];
  if (matches.length === 0) return content;
  let result = content;
  for (const match of matches) {
    const fullMatch = match[0];
    const alt = match[1] ?? "";
    const tempUrl = match[2]!;
    try {
      const permanentUrl = await storage.move(tempUrl, `articles/${articleId}`);
      result = result.replace(fullMatch, `![${alt}](${permanentUrl})`);
    } catch (err) {
      console.warn("[image] failed to move temp image", tempUrl, err);
    }
  }
  return result;
}

export async function cleanupDeletedImages(oldContent: string, newContent: string): Promise<void> {
  const oldUrls = new Set([...oldContent.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!));
  const newUrls = new Set([...newContent.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!));
  for (const url of oldUrls) {
    if (!newUrls.has(url)) {
      try {
        await storage.deleteFile(url);
      } catch (err) {
        console.warn("[image] failed to delete orphaned image", url, err);
      }
    }
  }
}

export async function cleanupAllImages(content: string): Promise<void> {
  const urls = [...content.matchAll(IMAGE_URL_PATTERN)].map((m) => m[1]!);
  for (const url of urls) {
    try {
      await storage.deleteFile(url);
    } catch (err) {
      console.warn("[image] failed to delete image", url, err);
    }
  }
}

export async function cleanupTempImages(maxAgeMs: number = TEMP_MAX_AGE_MS): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const files = await storage.listTempFiles();
  let deleted = 0;
  for (const { name, mtimeMs } of files) {
    if (mtimeMs < cutoff) {
      try {
        await storage.deleteTempFile(name);
        deleted++;
      } catch (err) {
        console.warn("[image] failed to delete temp file", name, err);
      }
    }
  }
  return deleted;
}
