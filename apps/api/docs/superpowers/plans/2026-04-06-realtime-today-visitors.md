# 오늘 방문자 실시간 카운트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오늘 방문자 수를 Redis SET으로 실시간 카운트하여 사이드바에 즉시 반영. 기존 배치 집계(어제 이전)와 조합.

**Architecture:** `AnalyticsCollectionService`에서 페이지뷰 기록 시 Redis SET에 세션ID 추가. `VisitorStatsService`에서 오늘 방문자는 Redis `SCARD`로, 어제 이전은 기존 `daily_visitor_stats`에서 조회. 총 방문자 = `daily_visitor_stats` SUM + Redis 오늘 SCARD.

**Tech Stack:** Spring Data Redis (`StringRedisTemplate`), Redis SET (`SADD`, `SCARD`, `EXPIREAT`)

---

### Task 1: Redis 방문자 기록 인터페이스 추가

**Files:**
- Create: `core/src/main/kotlin/com/giwon/blog/core/analytics/domain/VisitorCounter.kt`

domain 레이어에 인터페이스를 둔다. infrastructure에서 Redis로 구현.

- [ ] **Step 1: VisitorCounter 인터페이스 생성**

```kotlin
package com.giwon.blog.core.analytics.domain

import java.time.LocalDate

interface VisitorCounter {
    /** 해당 날짜의 방문자 SET에 세션 추가. 이미 있으면 false, 새로우면 true */
    fun addVisitor(date: LocalDate, sessionId: String): Boolean

    /** 해당 날짜의 고유 방문자 수 */
    fun getVisitorCount(date: LocalDate): Long
}
```

- [ ] **Step 2: Commit**

```bash
git add core/src/main/kotlin/com/giwon/blog/core/analytics/domain/VisitorCounter.kt
git commit -m "feat: VisitorCounter 도메인 인터페이스 추가"
```

---

### Task 2: Redis VisitorCounter 구현체

**Files:**
- Create: `core/src/main/kotlin/com/giwon/blog/core/analytics/infrastructure/redis/RedisVisitorCounter.kt`

- [ ] **Step 1: RedisVisitorCounter 구현**

```kotlin
package com.giwon.blog.core.analytics.infrastructure.redis

import com.giwon.blog.core.analytics.domain.VisitorCounter
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.ZoneId

@Component
class RedisVisitorCounter(
    private val redisTemplate: StringRedisTemplate,
) : VisitorCounter {

    override fun addVisitor(date: LocalDate, sessionId: String): Boolean {
        val key = "visitors:$date"
        val added = redisTemplate.opsForSet().add(key, sessionId)

        // 모레 자정에 만료 (어제 방문자로 표시될 때까지 유지)
        val expireAt = date.plusDays(2).atStartOfDay(ZoneId.systemDefault()).toInstant()
        redisTemplate.expireAt(key, expireAt)

        return added != null && added > 0
    }

    override fun getVisitorCount(date: LocalDate): Long {
        val key = "visitors:$date"
        return redisTemplate.opsForSet().size(key) ?: 0L
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:compileKotlin`

- [ ] **Step 3: Commit**

```bash
git add core/src/main/kotlin/com/giwon/blog/core/analytics/infrastructure/redis/RedisVisitorCounter.kt
git commit -m "feat: Redis SET 기반 VisitorCounter 구현"
```

---

### Task 3: AnalyticsCollectionService에서 Redis 방문자 기록

**Files:**
- Modify: `core/src/main/kotlin/com/giwon/blog/core/analytics/application/AnalyticsCollectionService.kt`

페이지뷰 기록 시 `VisitorCounter.addVisitor()`를 호출하여 Redis SET에 세션 추가.

- [ ] **Step 1: VisitorCounter 주입 및 호출 추가**

`AnalyticsCollectionService` 생성자에 `VisitorCounter` 추가. `recordPageView()`에서 sessionId가 있으면 `visitorCounter.addVisitor(LocalDate.now(), sessionId)` 호출.

현재 코드:
```kotlin
if (sessionId != null) {
    analyticsWriter.upsertSession(sessionId, ipAddress, userAgent)
}
```

변경:
```kotlin
if (sessionId != null) {
    analyticsWriter.upsertSession(sessionId, ipAddress, userAgent)
    visitorCounter.addVisitor(LocalDate.now(), sessionId)
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:compileKotlin`

- [ ] **Step 3: Commit**

```bash
git add core/src/main/kotlin/com/giwon/blog/core/analytics/application/AnalyticsCollectionService.kt
git commit -m "feat: 페이지뷰 기록 시 Redis 방문자 카운트 추가"
```

---

### Task 4: VisitorStatsService에서 오늘 방문자를 Redis에서 조회

**Files:**
- Modify: `core/src/main/kotlin/com/giwon/blog/core/analytics/application/VisitorStatsService.kt`

오늘/어제 방문자는 Redis에서, 총 방문자는 `daily_visitor_stats` SUM + 오늘 Redis 카운트로 조합.

- [ ] **Step 1: VisitorCounter 주입 및 조회 로직 변경**

현재 코드:
```kotlin
val total = analyticsReader.getTotalVisitorCount()
val todayCount = analyticsReader.getVisitorCountByDate(today).count
val yesterdayCount = analyticsReader.getVisitorCountByDate(yesterday).count
```

변경:
```kotlin
val todayCount = visitorCounter.getVisitorCount(today)
val yesterdayCount = visitorCounter.getVisitorCount(yesterday)
    .takeIf { it > 0 }
    ?: analyticsReader.getVisitorCountByDate(yesterday).count
val total = analyticsReader.getTotalVisitorCount() + todayCount
```

로직 설명:
- 오늘: Redis에서 실시간 조회
- 어제: Redis에 아직 있으면 Redis에서 (배치 전), 없으면 `daily_visitor_stats`에서 (배치 후)
- 총: 배치 집계분 + 오늘 실시간

- [ ] **Step 2: 컴파일 확인**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:compileKotlin`

- [ ] **Step 3: Commit**

```bash
git add core/src/main/kotlin/com/giwon/blog/core/analytics/application/VisitorStatsService.kt
git commit -m "feat: 오늘/어제 방문자를 Redis에서 실시간 조회"
```

---

### Task 5: 단위 테스트

**Files:**
- Modify: `core/src/test/kotlin/com/giwon/blog/core/analytics/application/VisitorStatsServiceTest.kt`

- [ ] **Step 1: VisitorStatsServiceTest에 VisitorCounter mock 추가**

기존 테스트에 `VisitorCounter`를 mock으로 주입하고, 오늘/어제 방문자가 Redis에서 조회되는지 검증.

테스트 케이스:
- 오늘 방문자: `visitorCounter.getVisitorCount(today)` 반환값 확인
- 어제 방문자 (Redis에 있을 때): Redis 값 사용
- 어제 방문자 (Redis에 없을 때): `daily_visitor_stats` 폴백
- 총 방문자: `daily_visitor_stats` SUM + 오늘 Redis 카운트

- [ ] **Step 2: 테스트 실행**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:test --tests "*VisitorStatsServiceTest*"`

- [ ] **Step 3: Commit**

```bash
git add core/src/test/kotlin/com/giwon/blog/core/analytics/application/VisitorStatsServiceTest.kt
git commit -m "test: VisitorStatsService Redis 방문자 카운트 테스트"
```

---

### Task 6: 통합 테스트 확인

**Files:**
- 변경 없음 (기존 TestContainersConfig에 이미 Redis 포함)

- [ ] **Step 1: 통합 테스트 실행**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :api-blog:test :api-admin:test`

Redis Testcontainer가 이미 설정되어 있으므로 `StringRedisTemplate` 빈이 자동 주입됨.

- [ ] **Step 2: 실패 시 수정, 성공 시 다음 Task로**
