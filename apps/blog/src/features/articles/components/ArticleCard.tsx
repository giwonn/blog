import Link from "next/link";
import { ArticleSummary } from "@/actions/articles";

interface ArticleCardProps {
  article: ArticleSummary;
}

export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Link href={`/articles/${article.slug}`} className="block">
      <article className="p-6 rounded-xl bg-white dark:bg-[#3a3a3a] border border-gray-300 dark:border-[#4a4a4a] shadow-md hover:shadow-xl hover:border-gray-400 dark:hover:border-[#5a5a5a] hover:-translate-y-1 transition-all duration-300">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xl font-semibold dark:text-white">{article.title}</h2>
          {article.seriesId && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded">시리즈</span>
          )}
          {article.bookId && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded">독후감</span>
          )}
        </div>
        <p className="text-gray-600 dark:text-[#c0c0c0] mb-2">{article.excerpt}</p>
        <time className="text-sm text-gray-500 dark:text-[#a0a0a0]">{article.date}</time>
      </article>
    </Link>
  );
}
