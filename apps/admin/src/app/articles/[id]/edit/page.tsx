"use client";

import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { getArticle, updateArticle } from "@/actions/articles";
import { PublishPanel } from "@/components/articles/PublishPanel";
import type { Article } from "@/types";

const MarkdownEditor = dynamic(
  () => import("@/components/editor/MarkdownEditor").then((mod) => mod.MarkdownEditor),
  {
    ssr: false,
    loading: () => (
      <div className="border border-gray-300 rounded-lg bg-white min-h-[500px] flex items-center justify-center text-gray-400">
        에디터 로딩 중...
      </div>
    ),
  }
);

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPublishPanel, setShowPublishPanel] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    async function fetchArticle() {
      try {
        const data = await getArticle(id);
        setTitle(data.title);
        setContent(data.content);
        setArticle(data);
      } catch {
        setError("글을 불러올 수 없습니다.");
      } finally {
        setIsFetching(false);
      }
    }
    fetchArticle();
  }, [id]);

  const handleSave = async (
    slug: string,
    status: string,
    password: string | null,
    seriesId: number | null,
    bookId: number | null
  ) => {
    if (!title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const updated = await updateArticle(id, {
        title,
        slug,
        content,
        status,
        password,
        seriesId,
        bookId,
      });
      setArticle(updated);
      router.push("/articles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setIsLoading(false);
      setShowPublishPanel(false);
    }
  };

  if (isFetching) {
    return (
      <div className="p-8 text-center text-gray-500">불러오는 중...</div>
    );
  }

  return (
    <div className="p-8 h-[calc(100vh-theme(spacing.16))] flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">글 수정</h1>
        <button
          onClick={() => setShowPublishPanel(true)}
          disabled={isLoading}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          저장
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4 flex-1 min-h-0">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
            placeholder="제목을 입력하세요"
            className="w-full px-4 py-3 text-2xl font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <MarkdownEditor content={content} onChange={(val) => { setContent(val); setIsDirty(true); }} />
      </form>

      <PublishPanel
        isOpen={showPublishPanel}
        onClose={() => setShowPublishPanel(false)}
        onSave={handleSave}
        defaultSlug={article?.slug}
        defaultStatus={article?.status}
        defaultPassword={article?.password}
        defaultSeriesId={article?.seriesId}
        defaultBookId={article?.bookId}
        titleForSlug={title}
      />
    </div>
  );
}
