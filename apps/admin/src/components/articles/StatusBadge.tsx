import type { Article } from "@/types";

const statusConfig: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "임시저장", className: "bg-gray-100 text-gray-700" },
  PUBLIC: { label: "공개", className: "bg-green-100 text-green-700" },
  LOCKED: { label: "비밀글", className: "bg-yellow-100 text-yellow-700" },
  PRIVATE: { label: "비공개", className: "bg-red-100 text-red-700" },
};

interface StatusBadgeProps {
  article: Article;
}

export function StatusBadge({ article }: StatusBadgeProps) {
  const config = statusConfig[article.status] ?? {
    label: article.status,
    className: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
