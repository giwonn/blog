"use client";

import { useEffect, useRef, useState } from "react";

interface TocItem {
    id: string;
    text: string;
    level: number;
}

interface TableOfContentsProps {
    content: string;
}

function extractHeadings(content: string): TocItem[] {
    // 코드블럭 제거
    const contentWithoutCode = content.replace(/```[\s\S]*?```/g, "");

    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    const headings: TocItem[] = [];
    let match;

    while ((match = headingRegex.exec(contentWithoutCode)) !== null) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text
            .toLowerCase()
            .replace(/[^a-z0-9가-힣\s-]/g, "")
            .replace(/\s+/g, "-");
        headings.push({ id, text, level });
    }

    return headings;
}

export function TableOfContents({ content }: TableOfContentsProps) {
    const [activeId, setActiveId] = useState<string>("");
    const navRef = useRef<HTMLElement>(null);
    const headings = extractHeadings(content);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id);
                    }
                });
            },
            { rootMargin: "0% 0px -85% 0px" }
        );

        headings.forEach(({ id }) => {
            const element = document.getElementById(id);
            if (element) observer.observe(element);
        });

        return () => observer.disconnect();
    }, [headings]);

    useEffect(() => {
        if (activeId && navRef.current) {
            const activeLink = navRef.current.querySelector(`[data-toc-id="${activeId}"]`);
            if (activeLink) {
                activeLink.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
    }, [activeId]);

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (hash) {
            const element = document.getElementById(hash);
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: "smooth" });
                }, 100);
            }
        }
    }, []);

    if (headings.length === 0) return null;

    return (
        <nav ref={navRef} className="toc-scroll border-l border-gray-200 dark:border-gray-700 max-h-[calc(100vh-5rem)] overflow-y-auto -ml-px">
            <p className="text-sm font-semibold mb-3 text-gray-500 dark:text-[#c0c0c0] pl-4">
                목차
            </p>
            <ul className="space-y-2 text-sm">
                {headings.map(({ id, text, level }) => (
                    <li key={id}>
                        <a
                            href={`#${id}`}
                            data-toc-id={id}
                            onClick={(e) => {
                                e.preventDefault();
                                setActiveId(id);
                                window.history.pushState(null, "", `#${id}`);
                                document.getElementById(id)?.scrollIntoView({
                                    behavior: "smooth",
                                });
                            }}
                            style={{ paddingLeft: `calc(1rem + ${(level - 1) * 12}px)` }}
                            className={`block py-0.5 pr-2 mr-2 rounded-r border-l-2 transition-colors ${
                                activeId === id
                                    ? "border-blue-500 dark:border-[#60a5fa] text-blue-500 dark:text-[#60a5fa] font-medium bg-blue-50 dark:bg-[rgba(96,165,250,0.2)]"
                                    : "border-transparent text-gray-600 dark:text-[#c0c0c0] hover:text-gray-900 hover:bg-gray-100 dark:hover:text-[#bfdbfe] dark:hover:bg-[rgba(255,255,255,0.08)]"
                            }`}
                        >
                            {text}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
