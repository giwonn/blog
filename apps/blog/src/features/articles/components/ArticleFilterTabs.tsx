"use client";

import { useRouter, useSearchParams } from "next/navigation";

const tabs = [
  { key: "all", label: "전체" },
  { key: "general", label: "일반 글" },
  { key: "series", label: "시리즈" },
  { key: "book", label: "독후감" },
];

export function ArticleFilterTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("filter") || "all";

  return (
    <div className="flex gap-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => router.push(`/articles?filter=${tab.key}`)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            current === tab.key
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#3a3a3a] dark:text-[#c0c0c0] dark:hover:bg-[#4a4a4a]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
