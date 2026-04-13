import Link from "next/link";
import type { ArticleNeighbors } from "@/types";

interface ArticleNeighborNavProps {
  neighbors: ArticleNeighbors;
  seriesSlug?: string;
  bookSlug?: string;
}

function buildArticleHref(slug: string, seriesSlug?: string, bookSlug?: string) {
  const params = new URLSearchParams();
  if (seriesSlug) params.set("series", seriesSlug);
  if (bookSlug) params.set("book", bookSlug);
  const query = params.toString();
  return `/articles/${slug}${query ? `?${query}` : ""}`;
}

export function ArticleNeighborNav({ neighbors, seriesSlug, bookSlug }: ArticleNeighborNavProps) {
  if (!neighbors.previous && !neighbors.next) return null;

  return (
    <nav className="mt-16 flex justify-between gap-4 border-t pt-8 dark:border-[#4a4a4a]">
      <div className="flex-1">
        {neighbors.previous && (
          <Link href={buildArticleHref(neighbors.previous.slug, seriesSlug, bookSlug)}
            className="block p-4 rounded-lg border border-gray-200 dark:border-[#4a4a4a] hover:border-gray-400 dark:hover:border-[#5a5a5a] transition-colors">
            <span className="text-sm text-gray-500 dark:text-[#a0a0a0]">&larr; 이전 글</span>
            <p className="mt-1 font-medium dark:text-white">{neighbors.previous.title}</p>
          </Link>
        )}
      </div>
      <div className="flex-1 text-right">
        {neighbors.next && (
          <Link href={buildArticleHref(neighbors.next.slug, seriesSlug, bookSlug)}
            className="block p-4 rounded-lg border border-gray-200 dark:border-[#4a4a4a] hover:border-gray-400 dark:hover:border-[#5a5a5a] transition-colors">
            <span className="text-sm text-gray-500 dark:text-[#a0a0a0]">다음 글 &rarr;</span>
            <p className="mt-1 font-medium dark:text-white">{neighbors.next.title}</p>
          </Link>
        )}
      </div>
    </nav>
  );
}
