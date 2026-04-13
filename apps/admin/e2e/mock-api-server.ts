import http from "http";

const mockData = {
  overview: { totalPageViews: 150, uniqueVisitors: 42 },
  pageViews: [
    { date: "2026-04-08", viewCount: 20 },
    { date: "2026-04-09", viewCount: 35 },
    { date: "2026-04-10", viewCount: 28 },
  ],
  topPages: [
    { articleId: 1, title: "TDD로 개발하기", viewCount: 45 },
    { articleId: 2, title: "Spring Boot 시작하기", viewCount: 32 },
    { articleId: 3, title: "React 19 새 기능", viewCount: 18 },
  ],
  referrers: [
    { referrer: "(직접 접속)", viewCount: 80 },
    { referrer: "https://google.com", viewCount: 40 },
  ],
  visitorLocations: [
    { ipAddress: "1.1.1.1", latitude: 37.5665, longitude: 126.978, country: "KR", city: "Seoul", visitCount: 25, lastVisitedAt: "2026-04-10T14:30:00" },
    { ipAddress: "2.2.2.2", latitude: 35.6762, longitude: 139.6503, country: "JP", city: "Tokyo", visitCount: 10, lastVisitedAt: "2026-04-10T12:00:00" },
    { ipAddress: "3.3.3.3", latitude: 40.7128, longitude: -74.006, country: "US", city: "New York", visitCount: 5, lastVisitedAt: "2026-04-09T09:15:00" },
  ],
  ipAccessHistory: [
    { path: "/articles/1", ipAddress: "1.1.1.1", country: "KR", city: "Seoul", createdAt: "2026-04-10T14:30:00" },
    { path: "/articles/2", ipAddress: "1.1.1.1", country: "KR", city: "Seoul", createdAt: "2026-04-10T13:00:00" },
    { path: "/", ipAddress: "1.1.1.1", country: "KR", city: "Seoul", createdAt: "2026-04-10T12:00:00" },
  ],
  articleAccessHistory: [
    { ipAddress: "1.1.1.1", country: "KR", city: "Seoul", createdAt: "2026-04-10T14:30:00" },
    { ipAddress: "2.2.2.2", country: "JP", city: "Tokyo", createdAt: "2026-04-10T13:00:00" },
    { ipAddress: "3.3.3.3", country: "US", city: "New York", createdAt: "2026-04-10T10:00:00" },
  ],
  popularArticles: [
    { id: 1, title: "TDD로 개발하기", viewCount: 45 },
    { id: 2, title: "Spring Boot 시작하기", viewCount: 32 },
  ],
  settings: { blogName: "테스트 블로그", analyticsEnabled: true },
};

function respond(res: http.ServerResponse, data: unknown) {
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ data }));
}

export function createMockApiServer(port = 8081): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" });
      res.end();
      return;
    }

    if (path === "/admin/analytics/overview") return respond(res, mockData.overview);
    if (path === "/admin/analytics/page-views") return respond(res, mockData.pageViews);
    if (path === "/admin/analytics/top-pages") return respond(res, mockData.topPages);
    if (path === "/admin/analytics/referrers") return respond(res, mockData.referrers);
    if (path === "/admin/analytics/visitor-locations") return respond(res, mockData.visitorLocations);
    if (path === "/admin/analytics/ip-access-history") return respond(res, mockData.ipAccessHistory);
    if (path === "/admin/analytics/article-access-history") return respond(res, mockData.articleAccessHistory);
    if (path === "/admin/dashboard/popular-articles") return respond(res, mockData.popularArticles);
    if (path === "/admin/settings") return respond(res, mockData.settings);

    // 글 목록 (빈 목록)
    if (path === "/admin/articles" && req.method === "GET") {
      return respond(res, { content: [], totalPages: 0, totalElements: 0 });
    }

    // fallback
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: `Not found: ${path}` }));
  });

  return server;
}

// CLI로 직접 실행 시
if (require.main === module) {
  const server = createMockApiServer();
  server.listen(8081, () => console.log("Mock API server running on http://localhost:8081"));
}
