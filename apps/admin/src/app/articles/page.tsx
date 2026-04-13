import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getArticles } from "@/actions/articles";
import { DeleteArticleButton } from "@/components/articles/DeleteArticleButton";
import { StatusBadge } from "@/components/articles/StatusBadge";

const BLOG_URL = process.env.BLOG_URL || "https://blog.giwon.dev";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ page?: string }>;

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Number(params.page) || 0;

  const articles = await getArticles(page);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">글 목록</h1>
      </div>

      {articles.content.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          작성된 글이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">제목</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">상태</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">작성일</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-500">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {articles.content.map((article) => (
                <tr key={article.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link href={`/articles/${article.id}`} className="text-blue-600 hover:underline">
                        {article.title}
                      </Link>
                      {article.status === "PUBLIC" && (
                        <a
                          href={`${BLOG_URL}/articles/${article.slug || article.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="블로그에서 보기"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge article={article} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(article.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/articles/${article.id}/edit`}
                        className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
                      >
                        수정
                      </Link>
                      <DeleteArticleButton articleId={article.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {articles.page.totalPages > 1 && (
            <div className="px-6 py-4 border-t flex justify-center gap-2">
              {Array.from({ length: articles.page.totalPages }, (_, i) => (
                <Link
                  key={i}
                  href={`/articles?page=${i}`}
                  className={`px-3 py-1 rounded text-sm ${
                    i === articles.page.number
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {i + 1}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
