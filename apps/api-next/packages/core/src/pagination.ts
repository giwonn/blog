/**
 * Minimal subset of Spring Data's Page<T> shape, mirroring the JSON
 * the legacy Kotlin API returns for paginated endpoints. The cutover
 * frontend consumes this exact shape, so do not rename or remove fields
 * without coordinating a frontend update.
 */
export type Page<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number; // current page index, 0-based
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
};

/**
 * Builds a Page<T> from a slice of content + the total row count.
 * Caller computes `content` and `totalElements` separately (one query
 * for rows, one for COUNT) then hands them in.
 */
export function makePage<T>(
  content: T[],
  totalElements: number,
  pageNumber: number,
  pageSize: number,
): Page<T> {
  const totalPages = pageSize > 0 ? Math.ceil(totalElements / pageSize) : 0;
  return {
    content,
    totalElements,
    totalPages,
    number: pageNumber,
    size: pageSize,
    first: pageNumber === 0,
    last: totalPages === 0 ? true : pageNumber >= totalPages - 1,
    empty: content.length === 0,
  };
}
