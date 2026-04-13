import Link from "next/link";
import { getSeriesList } from "@/actions/series";

export async function SeriesList() {
  const seriesList = await getSeriesList();

  return (
    <section>
      <h2 className="mb-8 text-3xl font-bold">시리즈</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {seriesList.map((series) => (
          <Link key={series.id} href={`/series/${series.slug}`} className="block">
            <article className="p-6 rounded-xl bg-white dark:bg-[#3a3a3a] border border-gray-300 dark:border-[#4a4a4a] shadow-md hover:shadow-xl hover:border-gray-400 dark:hover:border-[#5a5a5a] hover:-translate-y-1 transition-all duration-300">
              {series.thumbnailUrl && (
                <img src={series.thumbnailUrl} alt={series.title} className="w-full h-40 object-cover rounded-lg mb-4" />
              )}
              <h3 className="text-xl font-semibold mb-2 dark:text-white">{series.title}</h3>
              {series.description && (
                <p className="text-gray-600 dark:text-[#c0c0c0] mb-2 line-clamp-2">{series.description}</p>
              )}
              <span className="text-sm text-gray-500 dark:text-[#a0a0a0]">{series.articleCount}개의 글</span>
            </article>
          </Link>
        ))}
        {seriesList.length === 0 && (
          <p className="text-gray-500 dark:text-[#a0a0a0]">시리즈가 없습니다.</p>
        )}
      </div>
    </section>
  );
}
