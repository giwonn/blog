# 클라이언트 사이드 트래킹 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 사이드(API 필터) 트래킹을 클라이언트 사이드(브라우저 JS) 트래킹으로 전환. 한 페이지 방문 = 1건 기록. 모든 페이지(about 포함) 추적 가능.

**Architecture:** blog.giwon.dev에 클라이언트 컴포넌트(`PageTracker`)를 layout에 배치. 페이지 로드 시 blog의 Next.js API Route(`/api/track`)로 전송. API Route가 giwon-blog-api의 `/analytics/page-view`로 프록시. AnalyticsFilter 제거.

**Tech Stack:** Next.js (usePathname, API Route), Spring Boot (새 엔드포인트)

---

### Task 1: giwon-blog-api에 페이지뷰 수집 엔드포인트 추가

**Files (giwon-blog-api):**
- Create: `api-blog/src/main/kotlin/com/giwon/blog/api/controller/AnalyticsTrackController.kt`

현재 `AnalyticsFilter`가 하던 역할을 명시적 엔드포인트로 전환한다.

- [ ] **Step 1: AnalyticsTrackController 생성**

```kotlin
package com.giwon.blog.api.controller

import com.giwon.blog.core.analytics.application.AnalyticsCollectionService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class AnalyticsTrackController(
    private val analyticsCollectionService: AnalyticsCollectionService,
) {

    @PostMapping("/analytics/page-view")
    fun trackPageView(@RequestBody request: PageViewRequest): ResponseEntity<Void> {
        analyticsCollectionService.recordPageView(
            path = request.path,
            ipAddress = request.ipAddress,
            userAgent = request.userAgent,
            referrer = request.referrer,
            sessionId = request.sessionId,
        )
        return ResponseEntity.ok().build()
    }
}

data class PageViewRequest(
    val path: String,
    val ipAddress: String,
    val userAgent: String?,
    val referrer: String?,
    val sessionId: String?,
)
```

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew :api-blog:compileKotlin`

- [ ] **Step 3: Commit**

```bash
git add api-blog/src/main/kotlin/com/giwon/blog/api/controller/AnalyticsTrackController.kt
git commit -m "feat: 페이지뷰 수집 POST 엔드포인트 추가 (/analytics/page-view)"
```

---

### Task 2: AnalyticsFilter 제거

**Files (giwon-blog-api):**
- Delete: `api-blog/src/main/kotlin/com/giwon/blog/api/filter/AnalyticsFilter.kt`

- [ ] **Step 1: AnalyticsFilter 삭제**

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew :api-blog:compileKotlin`

- [ ] **Step 3: Commit**

```bash
git rm api-blog/src/main/kotlin/com/giwon/blog/api/filter/AnalyticsFilter.kt
git commit -m "refactor: AnalyticsFilter 제거 (클라이언트 사이드 트래킹으로 전환)"
```

---

### Task 3: blog.giwon.dev에 API Route 추가 (/api/track)

**Files (blog.giwon.dev):**
- Create: `src/app/api/track/route.ts`

브라우저에서 직접 giwon-blog-api를 호출할 수 없으므로 (내부 네트워크), blog의 API Route가 프록시한다. 브라우저 요청에서 IP, User-Agent를 추출하여 전달.

- [ ] **Step 1: API Route 생성**

```typescript
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("blog-session")?.value;

  const ipAddress = request.headers.get("x-forwarded-for") || request.ip || "unknown";
  const userAgent = request.headers.get("user-agent");

  await fetch(`${API_BASE_URL}/analytics/page-view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: body.path,
      ipAddress,
      userAgent,
      referrer: body.referrer || null,
      sessionId: sessionId || null,
    }),
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/track/route.ts
git commit -m "feat: 트래킹 프록시 API Route 추가 (/api/track)"
```

---

### Task 4: blog.giwon.dev에 PageTracker 클라이언트 컴포넌트 추가

**Files (blog.giwon.dev):**
- Create: `src/components/analytics/PageTracker.tsx`
- Modify: `src/app/layout.tsx`

브라우저에서 페이지 로드/이동 시 `/api/track`으로 전송하는 클라이언트 컴포넌트.

- [ ] **Step 1: PageTracker 컴포넌트 생성**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function PageTracker() {
  const pathname = usePathname();
  const lastTracked = useRef("");

  useEffect(() => {
    if (pathname === lastTracked.current) return;
    lastTracked.current = pathname;

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
      }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
```

`lastTracked`로 같은 경로 중복 전송 방지. `usePathname` 변경 시마다 실행 (클라이언트 네비게이션 포함).

- [ ] **Step 2: layout.tsx에 PageTracker 추가**

```tsx
import { PageTracker } from "@/components/analytics/PageTracker";

// body 안에 추가:
<PageTracker />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/PageTracker.tsx src/app/layout.tsx
git commit -m "feat: 클라이언트 사이드 페이지 트래킹 추가 (PageTracker)"
```

---

### Task 5: blog.giwon.dev articles.ts에서 헤더 전달 로직 제거

**Files (blog.giwon.dev):**
- Modify: `src/actions/articles.ts`

트래킹이 클라이언트에서 처리되므로, API 호출 시 X-Session-Id, X-Forwarded-For, Referer 전달이 더 이상 필요 없다.

- [ ] **Step 1: getBrowserHeaders 함수 및 헤더 전달 제거**

```typescript
"use server";

import { apiClient } from "@/lib/api";
import type { Article as ApiArticle, PageResponse } from "@/types";

// ... toArticleSummary, toArticle 그대로 ...

export async function getArticleSummaries(): Promise<ArticleSummary[]> {
  const page = await apiClient<PageResponse<ApiArticle>>("/articles?size=20");
  return page.content.map(toArticleSummary);
}

export async function getArticle(
  articleId: string
): Promise<Article | null> {
  try {
    const article = await apiClient<ApiArticle>(`/articles/${articleId}`);
    return toArticle(article);
  } catch {
    return null;
  }
}
```

`cookies`, `headers` import도 제거.

- [ ] **Step 2: Commit**

```bash
git add src/actions/articles.ts
git commit -m "refactor: articles.ts에서 트래킹 헤더 전달 로직 제거"
```

---

### Task 6: WebConfig CORS에 POST 허용 (api-blog)

**Files (giwon-blog-api):**
- Modify: `api-blog/src/main/kotlin/com/giwon/blog/api/config/WebConfig.kt`

현재 api-blog의 CORS는 `GET`만 허용한다. `/analytics/page-view`는 `POST`이므로 추가 필요.
단, blog의 Next.js API Route가 서버 사이드에서 호출하므로 CORS가 적용되지 않을 수 있다. 하지만 안전을 위해 추가한다.

- [ ] **Step 1: allowedMethods에 POST 추가**

```kotlin
.allowedMethods("GET", "POST")
```

- [ ] **Step 2: Commit**

```bash
git add api-blog/src/main/kotlin/com/giwon/blog/api/config/WebConfig.kt
git commit -m "feat: api-blog CORS에 POST 허용 (analytics 엔드포인트)"
```

---

### Task 7: 통합 테스트 확인

- [ ] **Step 1: giwon-blog-api 테스트**

Run: `./gradlew :api-blog:test :api-admin:test`

- [ ] **Step 2: 실패 시 수정**
