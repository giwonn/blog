import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("blog-session")?.value;

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent");

  fetch(`${API_BASE_URL}/analytics/page-view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: body.path,
      ipAddress,
      userAgent,
      referrer: body.referrer || null,
      sessionId: sessionId || null,
    }),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
