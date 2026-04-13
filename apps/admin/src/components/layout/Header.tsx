"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/": "대시보드",
  "/articles": "글 관리",
  "/articles/new": "새 글 작성",
  "/settings": "설정",
};

export function Header() {
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    if (pathname.match(/^\/articles\/\d+\/edit$/)) return "글 수정";
    if (pathname.match(/^\/articles\/\d+$/)) return "글 상세";
    return "Blog Admin";
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-lg font-semibold text-gray-900">{getPageTitle()}</h1>
      <Link
        href="/articles/new"
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        <span className="text-base leading-none">+</span>
        새 글 작성
      </Link>
    </header>
  );
}
