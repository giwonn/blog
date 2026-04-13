import Link from "next/link";
import { getBookDetail } from "@/actions/books";
import { notFound } from "next/navigation";

interface BookDetailProps {
  slug: string;
}

export async function BookDetail({ slug }: BookDetailProps) {
  const data = await getBookDetail(slug);
  if (!data) notFound();

  return (
    <section>
      <div className="flex gap-6 mb-8">
        {data.book.thumbnailUrl && (
          <img src={data.book.thumbnailUrl} alt={data.book.title} className="w-32 h-44 object-cover rounded-lg shadow shrink-0" />
        )}
        <div>
          <h1 className="text-3xl font-bold mb-2">{data.book.title}</h1>
          <p className="text-gray-600 dark:text-[#c0c0c0]">{data.book.author}</p>
          {data.book.publisher && <p className="text-sm text-gray-500 dark:text-[#a0a0a0]">{data.book.publisher}</p>}
          {data.book.rating && <p className="mt-2 text-yellow-500">{"★".repeat(data.book.rating)}{"☆".repeat(5 - data.book.rating)}</p>}
          {data.book.description && <p className="mt-3 text-gray-600 dark:text-[#c0c0c0]">{data.book.description}</p>}
        </div>
      </div>
      <div className="space-y-4">
        {data.articles.map((article, index) => (
          <Link key={article.id} href={`/articles/${article.slug}?book=${slug}`}
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
