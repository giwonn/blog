import type { VisitorSummary } from "@/types";

interface VisitorStatsProps {
  visitors: VisitorSummary;
}

export function VisitorStats({ visitors }: VisitorStatsProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        방문자
      </h3>
      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        <div>
          <div className="text-gray-500 dark:text-gray-400">전체</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {visitors.total.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">오늘</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {visitors.today.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-gray-400">어제</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {visitors.yesterday.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
