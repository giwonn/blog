# 어드민 분석 기능 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 인기 페이지를 경로 대신 글 제목으로 표시, (2) 유입 경로(Referer)가 수집되도록 수정, (3) 접속 IP가 실제 클라이언트 IP로 수집되도록 수정.

**Architecture:** blog.giwon.dev(Next.js SSR)에서 API 호출 시 브라우저의 `Referer`, `X-Forwarded-For` 헤더를 전달. API의 인기 페이지 응답에 글 제목을 포함.

**Tech Stack:** Next.js (headers()), Spring Boot, QueryDSL

---

### Task 1: blog.giwon.dev에서 API 호출 시 브라우저 헤더 전달

**Files (blog.giwon.dev 레포):**
- Modify: `src/lib/api.ts`
- Modify: `src/actions/articles.ts`

현재 blog의 `apiClient`는 헤더 없이 fetch한다:
```typescript
export async function apiClient<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  ...
}
```

Next.js App Router에서는 `headers()`로 들어온 요청 헤더에 접근 가능.

- [ ] **Step 1: apiClient에 headers 파라미터 추가**

`src/lib/api.ts` 수정:

```typescript
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080";

export async function apiClient<T>(path: string, options?: { headers?: HeadersInit }): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: options?.headers,
  });
  if (!res.ok) {
    throw new Error("API 요청에 실패했습니다");
  }
  const json = await res.json();
  return json.data;
}
```

- [ ] **Step 2: getArticle에서 브라우저 헤더 전달**

`src/actions/articles.ts`에서 `getArticle()` 수정. `next/headers`의 `headers()`로 브라우저 헤더 읽어서 API에 전달:

```typescript
import { headers } from "next/headers";

export async function getArticle(articleId: string): Promise<Article | null> {
  try {
    const headersList = await headers();
    const forwardHeaders: Record<string, string> = {};

    const xff = headersList.get("x-forwarded-for");
    if (xff) forwardHeaders["X-Forwarded-For"] = xff;

    const referer = headersList.get("referer");
    if (referer) forwardHeaders["Referer"] = referer;

    const article = await apiClient<ApiArticle>(`/articles/${articleId}`, {
      headers: forwardHeaders,
    });
    return toArticle(article);
  } catch {
    return null;
  }
}
```

`getArticleSummaries()`는 목록 조회라 헤더 전달 불필요.

- [ ] **Step 3: Commit (blog.giwon.dev 레포)**

```bash
cd ~/projects/blog.giwon.dev
git add src/lib/api.ts src/actions/articles.ts
git commit -m "feat: API 호출 시 브라우저 Referer, X-Forwarded-For 전달"
```

---

### Task 2: API의 인기 페이지를 글 제목으로 반환

**Files (giwon-blog-api 레포):**
- Modify: `core/src/main/kotlin/com/giwon/blog/core/analytics/domain/AnalyticsReader.kt` — `PageViewCount`에 `articleId`, `title` 추가
- Modify: `core/src/main/kotlin/com/giwon/blog/core/analytics/infrastructure/persistence/QueryDslAnalyticsReader.kt` — articles 테이블 join
- Modify: `api-admin/src/main/kotlin/com/giwon/blog/admin/controller/AnalyticsController.kt` — 응답 변경 확인

현재 `PageViewCount`는 `path`와 `viewCount`만 반환. path에서 article ID를 추출하여 articles 테이블과 join해서 제목을 가져와야 한다.

- [ ] **Step 1: PageViewCount DTO 변경**

`AnalyticsReader.kt`에서:

```kotlin
// 변경 전
data class PageViewCount(val path: String, val viewCount: Long)

// 변경 후
data class PageViewCount(val articleId: Long, val title: String, val viewCount: Long)
```

- [ ] **Step 2: QueryDslAnalyticsReader.findTopPages 수정**

path에서 `/articles/` 접두사를 제거하고 ID를 추출 → articles 테이블 join:

```kotlin
import com.giwon.blog.core.article.domain.QArticle.article

override fun findTopPages(from: LocalDateTime, to: LocalDateTime): List<PageViewCount> {
    return queryFactory
        .select(Projections.constructor(
            PageViewCount::class.java,
            article.id,
            article.title,
            pageView.count(),
        ))
        .from(pageView)
        .join(article).on(
            pageView.path.eq(
                Expressions.stringTemplate("'/articles/' || CAST({0} AS text)", article.id)
            )
        )
        .where(pageView.createdAt.between(from, to))
        .groupBy(article.id, article.title)
        .orderBy(pageView.count().desc())
        .fetch()
}
```

또는 더 간단하게, path에서 숫자를 추출하여 articleId로 변환하는 서브쿼리 대신, 두 번의 쿼리로 처리할 수도 있다:
1. path별 조회수 집계
2. path에서 ID 추출 → articles에서 제목 조회

QueryDSL의 문자열 연결이 복잡하면 후자가 낫다.

- [ ] **Step 3: admin.giwon.dev 프론트엔드 수정**

`AnalyticsContent.tsx`에서 인기 페이지 테이블의 "경로" 컬럼을 "제목"으로 변경:

```tsx
<th className="text-left py-2">제목</th>
...
<td className="py-2 text-sm truncate max-w-[300px]">{page.title}</td>
```

`actions/analytics.ts`의 `PageViewCount` 타입도 수정:
```typescript
export interface PageViewCount {
  articleId: number;
  title: string;
  viewCount: number;
}
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd ~/projects/giwon-blog-api && ./gradlew :core:compileKotlin`

- [ ] **Step 5: Commit (giwon-blog-api 레포)**

```bash
cd ~/projects/giwon-blog-api
git add -A
git commit -m "feat: 인기 페이지를 글 제목으로 반환"
```

- [ ] **Step 6: Commit (admin.giwon.dev 레포)**

```bash
cd ~/projects/admin.giwon.dev
git add -A
git commit -m "feat: 인기 페이지 경로 대신 글 제목 표시"
```

---

### Task 3: 통합 테스트 확인 및 최종 커밋

- [ ] **Step 1: giwon-blog-api 테스트**

Run: `cd ~/projects/giwon-blog-api && ./gradlew :api-blog:test :api-admin:test`

- [ ] **Step 2: 실패 시 수정**

- [ ] **Step 3: 최종 커밋 (수정사항 있을 경우)**
