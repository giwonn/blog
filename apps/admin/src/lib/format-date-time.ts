export function formatDateTime(dateStr: string): string {
  const utcDate = dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
  const date = new Date(utcDate);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${m}.${d} ${h}:${min}`;
}
