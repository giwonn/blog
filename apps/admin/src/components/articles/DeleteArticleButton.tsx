"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteArticle } from "@/actions/articles";

interface DeleteArticleButtonProps {
  articleId: number;
}

export function DeleteArticleButton({ articleId }: DeleteArticleButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    setIsLoading(true);

    try {
      await deleteArticle(articleId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isLoading}
      className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? "삭제 중..." : "삭제"}
    </button>
  );
}
