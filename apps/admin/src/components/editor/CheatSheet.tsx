"use client";

import { useState } from "react";

const SECTIONS = [
  {
    title: "텍스트 서식",
    items: [
      { syntax: "**굵게**", result: "굵게", shortcut: "Cmd+B" },
      { syntax: "*기울임*", result: "기울임", shortcut: "Cmd+I" },
      { syntax: "~~취소선~~", result: "취소선", shortcut: "Cmd+Shift+S" },
      { syntax: "<u>밑줄</u>", result: "밑줄", shortcut: "Cmd+U" },
      { syntax: "`인라인 코드`", result: "인라인 코드", shortcut: "Cmd+E" },
    ],
  },
  {
    title: "제목",
    items: [
      { syntax: "# 제목 1", result: "H1" },
      { syntax: "## 제목 2", result: "H2" },
      { syntax: "### 제목 3", result: "H3" },
      { syntax: "#### 제목 4", result: "H4" },
    ],
  },
  {
    title: "블록",
    items: [
      { syntax: "> 인용문", result: "인용문" },
      { syntax: "```언어\\n코드\\n```", result: "코드 블록" },
      { syntax: "---", result: "구분선" },
    ],
  },
  {
    title: "목록",
    items: [
      { syntax: "- 항목", result: "순서 없는 목록" },
      { syntax: "1. 항목", result: "순서 있는 목록" },
      { syntax: "- [ ] 항목", result: "체크박스" },
    ],
  },
  {
    title: "링크 & 이미지",
    items: [
      { syntax: "[텍스트](URL)", result: "링크" },
      { syntax: "![alt](URL)", result: "이미지" },
    ],
  },
  {
    title: "테이블",
    items: [
      { syntax: "| A | B |\\n|---|---|\\n| 1 | 2 |", result: "테이블" },
    ],
  },
  {
    title: "커스텀 컨테이너",
    items: [
      { syntax: ":::tip\\n내용\\n:::", result: "팁 (초록)" },
      { syntax: ":::warning 제목\\n내용\\n:::", result: "경고 (노랑)" },
      { syntax: ":::danger\\n내용\\n:::", result: "위험 (빨강)" },
      { syntax: ":::info 제목\\n내용\\n:::", result: "정보 (파랑)" },
    ],
  },
  {
    title: "기타",
    items: [
      { syntax: "$E=mc^2$", result: "인라인 수식" },
      { syntax: "$$\\nE=mc^2\\n$$", result: "블록 수식" },
      { syntax: "```mermaid\\ngraph LR\\n  A-->B\\n```", result: "Mermaid 다이어그램" },
      { syntax: "<br>", result: "줄바꿈" },
    ],
  },
];

export function CheatSheet() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 text-sm font-medium rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        title="마크다운 문법 도움말"
      >
        ?
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto mx-4">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center rounded-t-xl">
              <h2 className="text-lg font-bold">마크다운 Cheat Sheet</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4 space-y-6">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">
                    {section.title}
                  </h3>
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <div
                        key={item.syntax}
                        className="flex items-center gap-3 py-1.5 px-3 rounded hover:bg-gray-50 text-sm"
                      >
                        <code className="flex-1 text-xs bg-gray-100 px-2 py-1 rounded font-mono whitespace-pre-wrap">
                          {item.syntax.replace(/\\n/g, "\n")}
                        </code>
                        <span className="text-gray-600 min-w-[100px]">
                          {item.result}
                        </span>
                        {"shortcut" in item && item.shortcut && (
                          <kbd className="text-xs bg-gray-200 px-1.5 py-0.5 rounded min-w-[80px] text-center">
                            {item.shortcut}
                          </kbd>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
