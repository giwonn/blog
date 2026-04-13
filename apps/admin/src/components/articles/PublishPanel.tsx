"use client";

import { useState, useEffect } from "react";
import { getSeriesList } from "@/actions/series";
import { getBookList } from "@/actions/books";
import type { Series, Book } from "@/types";

interface PublishPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    slug: string,
    status: string,
    password: string | null,
    seriesId: number | null,
    bookId: number | null
  ) => Promise<void>;
  defaultSlug?: string;
  defaultStatus?: string;
  defaultPassword?: string | null;
  defaultSeriesId?: number | null;
  defaultBookId?: number | null;
  titleForSlug?: string;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function PublishPanel({
  isOpen,
  onClose,
  onSave,
  defaultSlug = "",
  defaultStatus = "PUBLIC",
  defaultPassword = null,
  defaultSeriesId = null,
  defaultBookId = null,
  titleForSlug = "",
}: PublishPanelProps) {
  const [slug, setSlug] = useState(defaultSlug);
  const [status, setStatus] = useState(defaultStatus);
  const [password, setPassword] = useState(defaultPassword ?? "");
  const [seriesId, setSeriesId] = useState<number | null>(defaultSeriesId);
  const [bookId, setBookId] = useState<number | null>(defaultBookId);
  const [isSaving, setIsSaving] = useState(false);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [bookList, setBookList] = useState<Book[]>([]);

  useEffect(() => {
    if (isOpen) {
      getSeriesList().then(setSeriesList).catch(() => {});
      getBookList().then(setBookList).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!slug && titleForSlug) {
      setSlug(generateSlug(titleForSlug));
    }
  }, [titleForSlug, slug]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const finalSlug = slug.trim() || generateSlug(titleForSlug);
      const pwd = status === "LOCKED" && password.trim() ? password.trim() : null;
      await onSave(finalSlug, status, pwd, seriesId, bookId);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">발행 설정</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-57px)]">
          {/* Slug */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">슬러그</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="url-friendly-slug"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400">URL에 사용될 슬러그입니다.</p>
          </div>

          {/* 상태 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DRAFT">임시저장</option>
              <option value="PUBLIC">공개</option>
              <option value="LOCKED">비밀글</option>
              <option value="PRIVATE">비공개</option>
            </select>
          </div>

          {/* 비밀번호 (LOCKED일 때만) */}
          {status === "LOCKED" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">비밀번호</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* 시리즈 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">시리즈 (선택)</label>
            <select
              value={seriesId ?? ""}
              onChange={(e) => setSeriesId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">없음</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          {/* 독후감 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">독후감 (선택)</label>
            <select
              value={bookId ?? ""}
              onChange={(e) => setBookId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">없음</option>
              {bookList.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </>
  );
}
