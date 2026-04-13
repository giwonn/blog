import { getArticleSummaries } from "@/actions/articles";
import { ArticleCard } from "@/features/articles/components/ArticleCard";
import { ArticleFilterTabs } from "@/features/articles/components/ArticleFilterTabs";

interface ArticleListProps {
  filter?: string;
}

export async function ArticleList({ filter = "all" }: ArticleListProps) {
  const articles = await getArticleSummaries(filter);

  return (
    <section>
      <h2 className="mb-4 text-3xl font-bold">글</h2>
      <ArticleFilterTabs />
      <div className="space-y-6">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
        {articles.length === 0 && (
          <p className="text-gray-500 dark:text-[#a0a0a0]">글이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
