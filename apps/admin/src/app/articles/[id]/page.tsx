import Link from "next/link";
import { getArticle } from "@/actions/articles";
import { DeleteArticleButton } from "@/components/articles/DeleteArticleButton";
import { StatusBadge } from "@/components/articles/StatusBadge";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function ArticleDetailPage({ params }: { params: Params }) {
  const { id: idStr } = await params;
  const id = Number(idStr);

  let article;
  try {
    article = await getArticle(id);
  } catch {
    notFound();
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{article.title}</h1>
          <StatusBadge article={article} />
        </div>
        <div className="flex gap-2">
          <Link
            href={`/articles/${id}/edit`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            수정
          </Link>
          <DeleteArticleButton articleId={id} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">글 정보</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">ID</dt>
                <dd className="font-medium">{article.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">상태</dt>
                <dd className="font-medium"><StatusBadge article={article} /></dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">작성일</dt>
                <dd className="font-medium">{new Date(article.createdAt).toLocaleDateString("ko-KR")}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">수정일</dt>
                <dd className="font-medium">{new Date(article.updatedAt).toLocaleDateString("ko-KR")}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">슬러그</dt>
                <dd className="font-medium">{article.slug}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">발행일</dt>
                <dd className="font-medium">
                  {article.publishedAt ? new Date(article.publishedAt).toLocaleString("ko-KR") : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">글자 수</dt>
                <dd className="font-medium">{article.content.length.toLocaleString()}자</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">비밀번호</dt>
                <dd className="font-medium">{article.password ? "설정됨" : "없음"}</dd>
              </div>
            </dl>
          </div>

        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">통계</h2>
            <div className="text-sm text-gray-500 text-center py-4">
              데이터 수집 중...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
