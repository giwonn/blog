import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "blog-session";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)) {
    const sessionId = crypto.randomUUID();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);

    response.cookies.set(SESSION_COOKIE, sessionId, {
      path: "/",
      httpOnly: true,
      expires: midnight,
    });
  }

  // /articles/{숫자} 패턴은 기존 id 기반 URL
  // 마이그레이션에서 slug = id로 설정했으므로 그대로 동작함
  // 향후 slug를 변경하면 별도 매핑이 필요할 수 있음

  return response;
}

export const config = {
  matcher: ["/articles/:path*"],
};
