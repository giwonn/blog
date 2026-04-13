"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getBook, updateBook } from "@/actions/books";
import type { Article } from "@/types";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function EditBookPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [isbn, setIsbn] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [readStartDate, setReadStartDate] = useState("");
  const [readEndDate, setReadEndDate] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const detail = await getBook(id);
        setTitle(detail.book.title);
        setSlug(detail.book.slug);
        setAuthor(detail.book.author);
        setPublisher(detail.book.publisher ?? "");
        setIsbn(detail.book.isbn ?? "");
        setDescription(detail.book.description ?? "");
        setThumbnailUrl(detail.book.thumbnailUrl ?? "");
        setReadStartDate(detail.book.readStartDate ?? "");
        setReadEndDate(detail.book.readEndDate ?? "");
        setRating(detail.book.rating ?? "");
        setArticles(detail.articles);
      } catch {
        setError("독후감을 불러올 수 없습니다.");
      } finally {
        setIsFetching(false);
      }
    }
    fetchData();
  }, [id]);

  const handleTitleChange = (value: string) => {
    const oldAutoSlug = generateSlug(title);
    setTitle(value);
    if (!slug || slug === oldAutoSlug) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }
    if (!slug.trim()) {
      setError("슬러그를 입력하세요.");
      return;
    }
    if (!author.trim()) {
      setError("저자를 입력하세요.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await updateBook(id, {
        title,
        slug,
        author,
        publisher: publisher || undefined,
        isbn: isbn || undefined,
        description: description || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        readStartDate: readStartDate || undefined,
        readEndDate: readEndDate || undefined,
        rating: rating !== "" ? Number(rating) : undefined,
      });
      router.push("/books");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return <div className="p-8 text-center text-gray-500">불러오는 중...</div>;
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">독후감 수정</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="책 제목"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">슬러그 *</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="url-friendly-slug"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">저자 *</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="저자명"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">출판사</label>
          <input
            type="text"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            placeholder="출판사 (선택)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ISBN</label>
          <input
            type="text"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="ISBN (선택)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="독후감 설명 (선택)"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 URL</label>
          <input
            type="text"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">독서 시작일</label>
            <input
              type="date"
              value={readStartDate}
              onChange={(e) => setReadStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">독서 종료일</label>
            <input
              type="date"
              value={readEndDate}
              onChange={(e) => setReadEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">평점</label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value ? Number(e.target.value) : "")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">선택 안 함</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? "저장 중..." : "저장"}
          </button>
          <button
            onClick={() => router.push("/books")}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            취소
          </button>
        </div>
      </div>

      {/* 독후감에 포함된 글 목록 */}
      {articles.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">포함된 글</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">순서</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">제목</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {articles.map((article, index) => (
                  <tr key={article.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-500">{article.orderInBook ?? index + 1}</td>
                    <td className="px-4 py-2 text-sm">{article.title}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{article.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
