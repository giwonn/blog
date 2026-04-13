export type SortDirection = "asc" | "desc";

export function sortBy<T>(data: T[], key: keyof T, direction: SortDirection): T[] {
  return [...data].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    // null은 항상 뒤로
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    let cmp: number;
    if (typeof aVal === "number" && typeof bVal === "number") {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }

    return direction === "asc" ? cmp : -cmp;
  });
}
