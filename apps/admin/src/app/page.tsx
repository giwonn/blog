import {
  getOverview,
  getDailyVisitors,
  getTopReferrers,
} from "@/actions/analytics";
import { AnalyticsContent } from "@/components/analytics/AnalyticsContent";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default async function DashboardPage() {
  const today = formatDate(new Date());
  const from = today;
  const to = today;

  const [overviewResult, dailyResult, referrersResult] = await Promise.allSettled([
    getOverview(from, to),
    getDailyVisitors(from, to),
    getTopReferrers(from, to),
  ]);

  return (
    <div className="p-8">
      <AnalyticsContent
        initialOverview={overviewResult.status === "fulfilled" ? overviewResult.value : null}
        initialDailyVisitors={dailyResult.status === "fulfilled" ? dailyResult.value : []}
        initialReferrers={referrersResult.status === "fulfilled" ? referrersResult.value : []}
        initialFrom={from}
        initialTo={to}
      />
    </div>
  );
}
