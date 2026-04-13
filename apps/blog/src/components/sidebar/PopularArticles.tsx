import Link from "next/link";
import type { PopularArticle } from "@/types";

interface PopularArticlesProps {
  articles: PopularArticle[];
}

export function PopularArticles({ articles }: PopularArticlesProps) {
  if (articles.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        인기글
      </h3>
      <ul className="space-y-1">
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              href={`/articles/${article.id}`}
              className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 line-clamp-1"
            >
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
