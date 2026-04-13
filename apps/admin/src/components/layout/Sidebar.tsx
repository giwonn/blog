"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { href: "/", label: "대시보드", icon: "H" },
  { href: "/articles", label: "글 관리", icon: "A" },
  { href: "/series", label: "시리즈", icon: "S" },
  { href: "/books", label: "독후감", icon: "B" },
  { href: "/settings", label: "설정", icon: "S" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-14 lg:w-56 bg-gray-900 text-white min-h-screen flex flex-col shrink-0 transition-all duration-200">
      <div className="px-2 lg:px-4 py-5 border-b border-gray-700">
        <Link href="/" className="text-lg font-bold hidden lg:block">Blog Admin</Link>
        <Link href="/" className="text-lg font-bold block lg:hidden text-center">B</Link>
      </div>
      <nav className="flex-1 py-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-2 lg:px-4 py-2.5 text-sm transition-colors justify-center lg:justify-start ${
                    isActive
                      ? "bg-gray-800 text-white border-l-2 border-blue-500"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white border-l-2 border-transparent"
                  }`}
                  title={item.label}
                >
                  <span className="w-5 h-5 flex items-center justify-center text-xs bg-gray-700 rounded shrink-0">
                    {item.icon}
                  </span>
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
