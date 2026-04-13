"use client";

import { useState, useEffect } from "react";
import {
  getOverview,
  getDailyVisitors,
  getTopPages,
  getTopReferrers,
  getArticleAccessHistory,
  type AnalyticsOverview,
  type DailyVisitorCount,
  type PageViewCount,
  type ReferrerCount,
  type ArticleAccessHistory,
} from "@/actions/analytics";
import { VisitorMap } from "./VisitorMap";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatDateTime } from "@/lib/format-date-time";
import { X } from "lucide-react";
import type { PresetKey } from "@/lib/date-range-presets";

function formatLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface AnalyticsContentProps {
  initialOverview: AnalyticsOverview | null;
  initialDailyVisitors: DailyVisitorCount[];
  initialReferrers: ReferrerCount[];
  initialFrom: string;
  initialTo: string;
}

export function AnalyticsContent({
  initialOverview,
  initialDailyVisitors,
  initialReferrers,
  initialFrom,
  initialTo,
}: AnalyticsContentProps) {
  const [appliedFrom, setAppliedFrom] = useState(initialFrom);
  const [appliedTo, setAppliedTo] = useState(initialTo);
  const [preset, setPreset] = useState<PresetKey>("today");
  const [overview, setOverview] = useState(initialOverview);
  const [dailyVisitors, setDailyVisitors] = useState(initialDailyVisitors);
  const [topPages, setTopPages] = useState<PageViewCount[]>([]);
  const [referrers, setReferrers] = useState(initialReferrers);
  const [isLoading, setIsLoading] = useState(false);
  const [isTopPagesLoading, setIsTopPagesLoading] = useState(true);

  // 인기 페이지 모달
  const [modalPage, setModalPage] = useState<PageViewCount | null>(null);
  const [accessHistory, setAccessHistory] = useState<ArticleAccessHistory[]>([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  useEffect(() => {
    fetchTopPages(appliedFrom, appliedTo);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTopPages(from: string, to: string) {
    setIsTopPagesLoading(true);
    try {
      const data = await getTopPages(from, to);
      setTopPages(data);
    } catch {
      // ignore
    } finally {
      setIsTopPagesLoading(false);
    }
  }

  async function handleDateChange(range: { from: Date; to: Date }, newPreset: PresetKey) {
    const fromStr = formatLocalDate(range.from);
    const toStr = formatLocalDate(range.to);
    setAppliedFrom(fromStr);
    setAppliedTo(toStr);
    setPreset(newPreset);
    setIsLoading(true);
    const [o, d, r] = await Promise.allSettled([
      getOverview(fromStr, toStr),
      getDailyVisitors(fromStr, toStr),
      getTopReferrers(fromStr, toStr),
    ]);
    if (o.status === "fulfilled") setOverview(o.value);
    if (d.status === "fulfilled") setDailyVisitors(d.value);
    if (r.status === "fulfilled") setReferrers(r.value);
    setIsLoading(false);
    fetchTopPages(fromStr, toStr);
  }

  async function handlePageClick(page: PageViewCount) {
    setModalPage(page);
    setIsModalLoading(true);
    try {
      const data = await getArticleAccessHistory(page.articleId, appliedFrom, appliedTo);
      setAccessHistory(data);
    } catch {
      setAccessHistory([]);
    } finally {
      setIsModalLoading(false);
    }
  }

  function closeModal() {
    setModalPage(null);
    setAccessHistory([]);
  }

  return (
    <>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <DateRangePicker
          from={new Date(appliedFrom + "T00:00:00")}
          to={new Date(appliedTo + "T00:00:00")}
          preset={preset}
          onChange={handleDateChange}
        />
      </div>

      <div className="space-y-6">
        {/* 개요 */}
        <div id="overview" className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">총 페이지뷰</div>
            <div className="text-3xl font-bold mt-1">
              {isLoading ? "..." : (overview?.totalPageViews ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">순 방문자</div>
            <div className="text-3xl font-bold mt-1">
              {isLoading ? "..." : (overview?.uniqueVisitors ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* 일별 방문자 */}
        <div id="daily" className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">일별 방문자</h2>
          {isLoading ? (
            <div className="text-gray-400 text-center py-8">불러오는 중...</div>
          ) : (
            <DailyLineChart data={dailyVisitors} from={appliedFrom} to={appliedTo} />
          )}
        </div>

        {/* 인기 페이지 */}
        <div id="popular" className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">인기 페이지</h2>
          {isTopPagesLoading ? (
            <div className="text-gray-400 text-center py-8">불러오는 중...</div>
          ) : topPages.length === 0 ? (
            <div className="text-gray-500 text-center py-8">데이터가 없습니다</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-sm text-gray-500 border-b">
                  <th className="text-left py-2">#</th>
                  <th className="text-left py-2">제목</th>
                  <th className="text-right py-2">조회수</th>
                </tr>
              </thead>
              <tbody>
                {topPages.slice(0, 10).map((page, i) => (
                  <tr
                    key={page.articleId}
                    className="border-b last:border-0 cursor-pointer transition-colors hover:bg-blue-50"
                    onClick={() => handlePageClick(page)}
                  >
                    <td className="py-2 text-sm text-gray-400 w-8">{i + 1}</td>
                    <td className="py-2 text-sm truncate max-w-[300px] text-blue-600">{page.title}</td>
                    <td className="py-2 text-sm text-right font-medium">{page.viewCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 유입 경로 */}
        <div id="referrers">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">유입 경로</h2>
            {isLoading ? (
              <div className="text-gray-400 text-center py-8">불러오는 중...</div>
            ) : referrers.length === 0 ? (
              <div className="text-gray-500 text-center py-8">데이터가 없습니다</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-sm text-gray-500 border-b">
                    <th className="text-left py-2">출처</th>
                    <th className="text-right py-2">방문수</th>
                  </tr>
                </thead>
                <tbody>
                  {referrers.slice(0, 10).map((ref) => (
                    <tr key={ref.referrer} className="border-b last:border-0">
                      <td className="py-2 text-sm truncate max-w-[200px]">{ref.referrer}</td>
                      <td className="py-2 text-sm text-right font-medium">{ref.viewCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 접속 IP */}
        <VisitorMap from={appliedFrom} to={appliedTo} />
      </div>

      {/* 접속 이력 모달 */}
      {modalPage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={closeModal}>
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="min-w-0 flex-1 mr-2">
                <h3 className="text-lg font-semibold truncate">{modalPage.title}</h3>
                <p className="text-sm text-gray-500">총 {modalPage.viewCount.toLocaleString()}회 조회</p>
              </div>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded flex-shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {isModalLoading ? (
                <div className="text-gray-400 text-center py-8">불러오는 중...</div>
              ) : accessHistory.length === 0 ? (
                <div className="text-gray-400 text-center py-8">접속 이력이 없습니다</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-sm text-gray-500 border-b">
                      <th className="text-left py-2">IP</th>
                      <th className="text-left py-2">지역</th>
                      <th className="text-right py-2">접속 시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessHistory.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 text-sm font-mono text-gray-700">{item.ipAddress}</td>
                        <td className="py-2 text-sm text-gray-600">
                          {[item.city, item.country].filter(Boolean).join(", ") || "-"}
                        </td>
                        <td className="py-2 text-sm text-right text-gray-600 whitespace-nowrap">
                          {formatDateTime(item.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {!isModalLoading && accessHistory.length > 0 && (
              <div className="border-t px-4 py-3 text-sm text-gray-500 text-right">
                총 {accessHistory.length}건
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DailyLineChart({ data, from, to }: { data: DailyVisitorCount[]; from: string; to: string }) {
  const dataMap = new Map(data.map((d) => [d.date, d.visitorCount]));

  // to 기준 최소 7일, from이 더 넓으면 from 사용
  const endDate = new Date(to + "T00:00:00");
  const minStart = new Date(endDate);
  minStart.setDate(minStart.getDate() - 6);
  const requestedStart = new Date(from + "T00:00:00");
  const startDate = requestedStart < minStart ? requestedStart : minStart;

  const days: DailyVisitorCount[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = formatLocalDate(current);
    days.push({ date: dateStr, visitorCount: dataMap.get(dateStr) ?? 0 });
    current.setDate(current.getDate() + 1);
  }

  if (days.length === 0) return <div className="text-gray-400 text-center py-8">데이터가 없습니다</div>;

  const width = 800;
  const height = 200;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 50;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const maxCount = Math.max(...days.map((d) => d.visitorCount), 1);

  const yTicks: number[] = [];
  if (maxCount <= 5) {
    for (let i = 0; i <= maxCount; i++) yTicks.push(i);
  } else {
    const step = Math.ceil(maxCount / 5);
    for (let i = 0; i <= maxCount; i += step) yTicks.push(i);
    if (yTicks[yTicks.length - 1] < maxCount) yTicks.push(maxCount);
  }

  const getX = (i: number) => paddingLeft + (i / (days.length - 1)) * chartW;
  const getY = (v: number) => paddingTop + chartH - (v / maxCount) * chartH;

  const linePath = days.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.visitorCount)}`).join(" ");
  const areaPath = linePath + ` L ${getX(days.length - 1)} ${getY(0)} L ${getX(0)} ${getY(0)} Z`;

  // x축 라벨: 날짜가 많으면 간격 조절
  const labelInterval = days.length <= 7 ? 1 : Math.ceil(days.length / 7);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={paddingLeft}
              y1={getY(tick)}
              x2={width - paddingRight}
              y2={getY(tick)}
              stroke="#e5e7eb"
              strokeDasharray={tick === 0 ? "0" : "4 2"}
            />
            <text x={paddingLeft - 8} y={getY(tick) + 4} textAnchor="end" className="fill-gray-400" fontSize="11">
              {tick}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#areaGradient)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        {days.map((d, i) => (
          <g key={d.date}>
            <circle cx={getX(i)} cy={getY(d.visitorCount)} r="3" fill="#3b82f6" />
            <title>{`${d.date}: ${d.visitorCount}회`}</title>
          </g>
        ))}

        {days.map((d, i) =>
          i % labelInterval === 0 || i === days.length - 1 ? (
            <text
              key={d.date}
              x={getX(i)}
              y={height - paddingBottom + 20}
              textAnchor="middle"
              className="fill-gray-400"
              fontSize="10"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}
