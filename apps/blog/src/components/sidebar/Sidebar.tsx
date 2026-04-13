import { getPopularArticles, getRecentComments, getVisitorSummary } from "@/actions/sidebar";
import { PopularArticles } from "./PopularArticles";
import { RecentComments } from "./RecentComments";
import { VisitorStats } from "./VisitorStats";

export async function Sidebar() {
  const [articles, comments, visitors] = await Promise.all([
    getPopularArticles(),
    getRecentComments(),
    getVisitorSummary(),
  ]);

  return (
    <div className="fixed bottom-4 left-4 z-50 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-3">
      <VisitorStats visitors={visitors} />
      <PopularArticles articles={articles} />
      <RecentComments comments={comments} />
    </div>
  );
}
