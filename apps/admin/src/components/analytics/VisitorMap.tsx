"use client";

import { useEffect, useRef, useState } from "react";
import { getVisitorLocations, getIpAccessHistory, type VisitorLocation, type IpAccessHistory } from "@/actions/analytics";
import type { MapRendererProps, MapFocus } from "./MapRenderer";
import { formatDateTime } from "@/lib/format-date-time";
import { sortBy, type SortDirection } from "@/lib/sort-utils";
import { ArrowLeft, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface VisitorMapProps {
  from: string;
  to: string;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />;
  return direction === "asc"
    ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
    : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />;
}

function SortableHeader<K extends string>({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: K;
  currentKey: K | null;
  direction: SortDirection;
  onSort: (key: K) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`py-2 text-sm text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <SortIcon active={currentKey === sortKey} direction={direction} />
      </span>
    </th>
  );
}

type LocationSortKey = "ipAddress" | "location" | "visitCount" | "lastVisitedAt";
type DetailSortKey = "path" | "location" | "createdAt";

export function VisitorMap({ from, to }: VisitorMapProps) {
  const [locations, setLocations] = useState<VisitorLocation[]>([]);
  const [MapComponent, setMapComponent] = useState<React.ComponentType<MapRendererProps> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const focusKeyRef = useRef(0);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [accessHistory, setAccessHistory] = useState<IpAccessHistory[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // 목록 정렬 (기본: 최근 방문 내림차순)
  const [listSortKey, setListSortKey] = useState<LocationSortKey | null>("lastVisitedAt");
  const [listSortDir, setListSortDir] = useState<SortDirection>("desc");

  // 상세 정렬
  const [detailSortKey, setDetailSortKey] = useState<DetailSortKey | null>(null);
  const [detailSortDir, setDetailSortDir] = useState<SortDirection>("asc");

  useEffect(() => {
    import("./VisitorMapNaver").then((mod) => {
      setMapComponent(() => mod.VisitorMapNaver);
    });
  }, []);

  useEffect(() => {
    async function fetchLocations() {
      setIsLoading(true);
      setFocus(null);
      setSelectedIp(null);
      setAccessHistory([]);
      try {
        const data = await getVisitorLocations(from, to);
        setLocations(data);
        if (data.length > 0) {
          const latest = data.reduce((a, b) => a.lastVisitedAt > b.lastVisitedAt ? a : b);
          setFocus({ ip: latest.ipAddress, key: ++focusKeyRef.current });
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    fetchLocations();
  }, [from, to]);

  async function handleIpClick(ip: string) {
    setFocus({ ip, key: ++focusKeyRef.current });
    setSelectedIp(ip);
    setIsDetailLoading(true);
    setDetailSortKey(null);
    try {
      const data = await getIpAccessHistory(ip, from, to);
      setAccessHistory(data);
    } catch {
      setAccessHistory([]);
    } finally {
      setIsDetailLoading(false);
    }
  }

  function handleBack() {
    setSelectedIp(null);
    setAccessHistory([]);
  }

  function handleMapInteraction() {
    setFocus(null);
  }

  function handleListSort(key: LocationSortKey) {
    if (listSortKey === key) {
      setListSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setListSortKey(key);
      setListSortDir("asc");
    }
  }

  function handleDetailSort(key: DetailSortKey) {
    if (detailSortKey === key) {
      setDetailSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setDetailSortKey(key);
      setDetailSortDir("asc");
    }
  }

  // location 키를 위한 가상 필드 포함 정렬
  function getSortedLocations(): VisitorLocation[] {
    if (!listSortKey) return locations;
    if (listSortKey === "location") {
      const withLocation = locations.map((l) => ({
        ...l,
        _location: [l.city, l.country].filter(Boolean).join(", ") || "",
      }));
      return sortBy(withLocation, "_location", listSortDir).map(({ _location, ...rest }) => rest);
    }
    return sortBy(locations, listSortKey, listSortDir);
  }

  function getSortedHistory(): IpAccessHistory[] {
    if (!detailSortKey) return accessHistory;
    if (detailSortKey === "location") {
      const withLocation = accessHistory.map((h) => ({
        ...h,
        _location: [h.city, h.country].filter(Boolean).join(", ") || "",
      }));
      return sortBy(withLocation, "_location", detailSortDir).map(({ _location, ...rest }) => rest);
    }
    return sortBy(accessHistory, detailSortKey, detailSortDir);
  }

  const selectedLocation = selectedIp ? locations.find((l) => l.ipAddress === selectedIp) : null;
  const sortedLocations = getSortedLocations();
  const sortedHistory = getSortedHistory();

  return (
    <div id="map" className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">접속 IP</h2>

      {/* 지도 */}
      <div className="h-[400px] rounded-lg overflow-hidden bg-gray-100 mb-6">
        {!MapComponent || isLoading ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            {isLoading ? "불러오는 중..." : "지도 로딩 중..."}
          </div>
        ) : (
          <MapComponent locations={locations} focus={focus} onMapInteraction={handleMapInteraction} />
        )}
      </div>

      {/* IP 목록 또는 상세 이력 */}
      {isLoading ? (
        <div className="text-gray-400 text-center py-8">불러오는 중...</div>
      ) : locations.length === 0 ? (
        <div className="text-gray-400 text-center py-8">데이터가 없습니다</div>
      ) : selectedIp ? (
        /* 상세 이력 */
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleBack}
              className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div>
              <h3 className="text-base font-semibold font-mono">{selectedIp}</h3>
              {selectedLocation && (
                <p className="text-sm text-gray-500">
                  {[selectedLocation.city, selectedLocation.country].filter(Boolean).join(", ") || "-"}
                  {" · "}
                  {selectedLocation.visitCount}회 방문
                </p>
              )}
            </div>
          </div>

          {isDetailLoading ? (
            <div className="text-gray-400 text-center py-8">불러오는 중...</div>
          ) : accessHistory.length === 0 ? (
            <div className="text-gray-400 text-center py-8">접속 이력이 없습니다</div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <SortableHeader label="페이지" sortKey="path" currentKey={detailSortKey} direction={detailSortDir} onSort={handleDetailSort} />
                    <SortableHeader label="위치" sortKey="location" currentKey={detailSortKey} direction={detailSortDir} onSort={handleDetailSort} />
                    <SortableHeader label="접속 시간" sortKey="createdAt" currentKey={detailSortKey} direction={detailSortDir} onSort={handleDetailSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedHistory.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 text-sm truncate max-w-[200px]" title={item.path}>
                        {item.path}
                      </td>
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
              <div className="mt-3 text-sm text-gray-500 text-right">
                총 {accessHistory.length}건
              </div>
            </>
          )}
        </div>
      ) : (
        /* IP 목록 */
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <SortableHeader label="IP" sortKey="ipAddress" currentKey={listSortKey} direction={listSortDir} onSort={handleListSort} />
              <SortableHeader label="위치" sortKey="location" currentKey={listSortKey} direction={listSortDir} onSort={handleListSort} />
              <SortableHeader label="방문수" sortKey="visitCount" currentKey={listSortKey} direction={listSortDir} onSort={handleListSort} align="right" />
              <SortableHeader label="최근 방문" sortKey="lastVisitedAt" currentKey={listSortKey} direction={listSortDir} onSort={handleListSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedLocations.map((loc) => (
              <tr
                key={loc.ipAddress}
                className="border-b last:border-0 cursor-pointer transition-colors hover:bg-blue-50"
                onClick={() => handleIpClick(loc.ipAddress)}
              >
                <td className="py-2 text-sm font-mono text-blue-600">{loc.ipAddress}</td>
                <td className="py-2 text-sm text-gray-600">
                  {[loc.city, loc.country].filter(Boolean).join(", ") || "-"}
                </td>
                <td className="py-2 text-sm text-right font-medium">{loc.visitCount}</td>
                <td className="py-2 text-sm text-right text-gray-600 whitespace-nowrap">
                  {formatDateTime(loc.lastVisitedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
