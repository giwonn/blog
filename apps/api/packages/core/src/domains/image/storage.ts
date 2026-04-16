import path from "node:path";
import { mkdir, readdir, stat, unlink, rename } from "node:fs/promises";
import { env } from "../../env";

/**
 * Writes bytes to `{IMAGE_STORAGE_PATH}/{relPath}` and returns the absolute
 * path. Creates parent dirs as needed.
 */
export async function write(relPath: string, data: Uint8Array): Promise<string> {
  const full = path.join(env.IMAGE_STORAGE_PATH, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await Bun.write(full, data);
  return full;
}

/**
 * Given a public URL (e.g. `http://host/images/temp/abc.png`), moves the
 * underlying file from temp to `targetSubdir` (relative to storage root)
 * and returns the new public URL.
 */
export async function move(publicUrl: string, targetSubdir: string): Promise<string> {
  const rel = urlToRelPath(publicUrl);
  if (!rel) throw new Error(`not a managed image url: ${publicUrl}`);
  const filename = path.basename(rel);
  const srcAbs = path.join(env.IMAGE_STORAGE_PATH, rel);
  const destRel = path.join(targetSubdir, filename);
  const destAbs = path.join(env.IMAGE_STORAGE_PATH, destRel);
  await mkdir(path.dirname(destAbs), { recursive: true });
  await rename(srcAbs, destAbs);
  return `${env.IMAGE_PUBLIC_URL}/${destRel.split(path.sep).join("/")}`;
}

/**
 * Deletes the file backing a public URL. No-op if the URL is not managed
 * or the file is already missing.
 */
export async function deleteFile(publicUrl: string): Promise<void> {
  const rel = urlToRelPath(publicUrl);
  if (!rel) return;
  const abs = path.join(env.IMAGE_STORAGE_PATH, rel);
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function listTempFiles(): Promise<{ name: string; mtimeMs: number }[]> {
  const tempDir = path.join(env.IMAGE_STORAGE_PATH, "temp");
  let entries: string[];
  try {
    entries = await readdir(tempDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: { name: string; mtimeMs: number }[] = [];
  for (const name of entries) {
    try {
      const s = await stat(path.join(tempDir, name));
      if (s.isFile()) out.push({ name, mtimeMs: s.mtimeMs });
    } catch {
      // ignore missing/racing files
    }
  }
  return out;
}

export async function deleteTempFile(name: string): Promise<void> {
  const abs = path.join(env.IMAGE_STORAGE_PATH, "temp", name);
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Returns the storage-root-relative path if the URL is prefixed with
 * `IMAGE_PUBLIC_URL`; otherwise null (external URL, leave alone).
 */
function urlToRelPath(publicUrl: string): string | null {
  const prefix = `${env.IMAGE_PUBLIC_URL}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  return publicUrl.slice(prefix.length);
}
