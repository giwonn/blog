"use client";

import { useState, useEffect } from "react";
import {
  getSettings,
  updateBlogConfig,
  updateAnalyticsConfig,
  type BlogConfig,
  type AnalyticsConfig,
} from "@/actions/settings";

export default function SettingsPage() {
  const [blog, setBlog] = useState<BlogConfig>({
    name: "",
    description: "",
    profileImage: null,
  });
  const [analytics, setAnalytics] = useState<AnalyticsConfig>({
    trackingEnabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [blogSaving, setBlogSaving] = useState(false);
  const [analyticsSaving, setAnalyticsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      setIsLoading(true);
      try {
        const settings = await getSettings();
        setBlog(settings.blog);
        setAnalytics(settings.analytics);
      } catch {
        // API 연결 전이면 기본값 유지
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleBlogSave() {
    setBlogSaving(true);
    try {
      const settings = await updateBlogConfig(blog);
      setBlog(settings.blog);
      setAnalytics(settings.analytics);
      setToast("블로그 정보가 저장되었습니다");
    } catch {
      setToast("저장에 실패했습니다");
    } finally {
      setBlogSaving(false);
    }
  }

  async function handleAnalyticsSave() {
    setAnalyticsSaving(true);
    try {
      const settings = await updateAnalyticsConfig(analytics);
      setBlog(settings.blog);
      setAnalytics(settings.analytics);
      setToast("분석 설정이 저장되었습니다");
    } catch {
      setToast("저장에 실패했습니다");
    } finally {
      setAnalyticsSaving(false);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">설정</h1>

      {isLoading ? (
        <div className="text-center text-gray-500 py-20">불러오는 중...</div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          {/* 블로그 정보 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">블로그 정보</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  블로그 이름
                </label>
                <input
                  type="text"
                  value={blog.name}
                  onChange={(e) => setBlog({ ...blog, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="블로그 이름을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  블로그 설명
                </label>
                <textarea
                  value={blog.description}
                  onChange={(e) => setBlog({ ...blog, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="블로그 설명을 입력하세요"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleBlogSave}
                  disabled={blogSaving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {blogSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>

          {/* 분석 설정 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">분석 설정</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    방문자 추적
                  </span>
                  <p className="text-sm text-gray-500 mt-0.5">
                    페이지뷰 및 방문자 통계를 수집합니다
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analytics.trackingEnabled}
                  onClick={() =>
                    setAnalytics({
                      ...analytics,
                      trackingEnabled: !analytics.trackingEnabled,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    analytics.trackingEnabled ? "bg-blue-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      analytics.trackingEnabled
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleAnalyticsSave}
                  disabled={analyticsSaving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {analyticsSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
