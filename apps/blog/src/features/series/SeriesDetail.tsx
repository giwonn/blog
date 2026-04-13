import Link from "next/link";
import { getSeriesDetail } from "@/actions/series";
import { notFound } from "next/navigation";

interface SeriesDetailProps {
  slug: string;
}

export async function SeriesDetail({ slug }: SeriesDetailProps) {
  const data = await getSeriesDetail(slug);
  if (!data) notFound();

  return (
    <section>
      <h1 className="text-3xl font-bold mb-2">{data.series.title}</h1>
      {data.series.description && (
        <p className="text-gray-600 dark:text-[#c0c0c0] mb-8">{data.series.description}</p>
      )}
      <div className="space-y-4">
        {data.articles.map((article, index) => (
          <Link key={article.id} href={`/articles/${article.slug}?series=${slug}`}
            className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-[#4a4a4a] hover:border-gray-400 dark:hover:border-[#5a5a5a] transition-colors">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-[#4a4a4a] text-sm font-medium shrink-0">{index + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium dark:text-white truncate">{article.title}</p>
              <time className="text-sm text-gray-500 dark:text-[#a0a0a0]">
                {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("ko-KR") : new Date(article.createdAt).toLocaleDateString("ko-KR")}
              </time>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
