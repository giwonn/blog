# Caffeine → Redis 캐시 교체 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** api-blog과 api-admin이 각각 독립된 Caffeine 인메모리 캐시를 사용하여 admin에서 글 수정 시 blog 캐시가 갱신되지 않는 문제를, Redis 공유 캐시로 교체하여 해결한다.

**Architecture:** Spring Cache 추상화(`CacheManager`)를 이미 사용 중이므로, `CacheConfig`에서 `CaffeineCacheManager` → `RedisCacheManager`로 교체한다. `ArticleService`의 수동 캐시 조작(`cache.get()`, `cache.put()`, `cache.evict()`)은 그대로 동작한다. `@Cacheable`을 사용하는 `GitHubCommentService`도 자동으로 Redis를 사용하게 된다. Article 엔티티가 Redis에 직렬화되어야 하므로 `Serializable` 구현이 필요하다.

**Tech Stack:** Spring Boot 3.5, spring-boot-starter-data-redis, Redis 7, Jackson (JSON 직렬화)

---

### Task 1: Article 엔티티에 Serializable 추가

**Files:**
- Modify: `core/src/main/kotlin/com/giwon/blog/core/article/domain/Article.kt`

Article이 Redis에 저장되려면 직렬화 가능해야 한다. JSON 직렬화를 사용할 예정이지만, Spring Cache의 기본 동작과 호환성을 위해 `Serializable`도 추가한다.

- [ ] **Step 1: Article에 Serializable 구현 추가**

`core/src/main/kotlin/com/giwon/blog/core/article/domain/Article.kt`의 class 선언을 수정:

```kotlin
import java.io.Serializable

@Entity
@Table(name = "articles")
class Article(
    // ... 기존 필드 그대로
) : Serializable {
    // ... 기존 프로퍼티 그대로

    companion object {
        private const val serialVersionUID = 1L
    }
}
```

- [ ] **Step 2: RecentComment에 Serializable 구현 추가**

`core/src/main/kotlin/com/giwon/blog/core/comment/application/GitHubCommentService.kt`의 `RecentComment` data class 수정:

```kotlin
import java.io.Serializable

data class RecentComment(
    val body: String,
    val author: String,
    val avatarUrl: String,
    val url: String,
    val createdAt: String,
) : Serializable {
    companion object {
        private const val serialVersionUID = 1L
    }
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:compileKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: 기존 테스트 통과 확인**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:test`
Expected: BUILD SUCCESSFUL, 기존 테스트 전부 통과

- [ ] **Step 5: Commit**

```bash
cd /Users/allen/projects/giwon-blog-api
git add core/src/main/kotlin/com/giwon/blog/core/article/domain/Article.kt \
        core/src/main/kotlin/com/giwon/blog/core/comment/application/GitHubCommentService.kt
git commit -m "feat: Article, RecentComment에 Serializable 추가 (Redis 직렬화 준비)"
```

---

### Task 2: Gradle 의존성 교체 (Caffeine → Redis)

**Files:**
- Modify: `core/build.gradle.kts`

- [ ] **Step 1: caffeine 의존성을 redis로 교체**

`core/build.gradle.kts`에서:

```kotlin
// 삭제:
implementation("com.github.ben-manes.caffeine:caffeine")

// 추가:
implementation("org.springframework.boot:spring-boot-starter-data-redis")
```

`spring-boot-starter-data-redis`가 `spring-boot-starter-cache`를 포함하므로, `spring-boot-starter-cache`는 그대로 둬도 되고 제거해도 된다. 명시성을 위해 그대로 둔다.

- [ ] **Step 2: 컴파일 확인**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:compileKotlin`
Expected: BUILD SUCCESSFUL (CacheConfig에서 Caffeine import 에러 발생 — 다음 Task에서 수정)

실제로는 CacheConfig가 Caffeine을 import하므로 컴파일 실패할 수 있다. 이 경우 Task 3으로 바로 이어서 진행.

- [ ] **Step 3: Commit**

```bash
cd /Users/allen/projects/giwon-blog-api
git add core/build.gradle.kts
git commit -m "build: caffeine 의존성을 spring-boot-starter-data-redis로 교체"
```

---

### Task 3: CacheConfig를 Redis로 교체

**Files:**
- Modify: `core/src/main/kotlin/com/giwon/blog/core/config/CacheConfig.kt`

기존 `CaffeineCacheManager`를 `RedisCacheManager`로 교체한다. JSON 직렬화를 사용하여 Redis에서 데이터를 사람이 읽을 수 있게 하고, JPA 프록시 객체 직렬화 문제를 방지한다.

- [ ] **Step 1: CacheConfig를 RedisCacheManager로 교체**

`core/src/main/kotlin/com/giwon/blog/core/config/CacheConfig.kt` 전체를 다음으로 교체:

```kotlin
package com.giwon.blog.core.config

import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.kotlinModule
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.EnableCaching
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.cache.RedisCacheConfiguration
import org.springframework.data.redis.cache.RedisCacheManager
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer
import org.springframework.data.redis.serializer.RedisSerializationContext
import org.springframework.data.redis.serializer.StringRedisSerializer
import java.time.Duration

@Configuration
@EnableCaching
class CacheConfig {

    @Bean
    fun cacheManager(redisConnectionFactory: RedisConnectionFactory): CacheManager {
        val objectMapper = ObjectMapper()
            .registerModule(kotlinModule())
            .registerModule(JavaTimeModule())
            .activateDefaultTyping(
                LaissezFaireSubTypeValidator.instance,
                ObjectMapper.DefaultTyping.NON_FINAL,
                JsonTypeInfo.As.PROPERTY,
            )

        val jsonSerializer = GenericJackson2JsonRedisSerializer(objectMapper)

        val defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofHours(1))
            .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(jsonSerializer))

        return RedisCacheManager.builder(redisConnectionFactory)
            .cacheDefaults(defaultConfig)
            .initialCacheNames(setOf("articles", "articleList", "comments"))
            .build()
    }
}
```

핵심 포인트:
- `GenericJackson2JsonRedisSerializer`: 타입 정보를 포함한 JSON 직렬화 (역직렬화 시 원래 타입으로 복원)
- `JavaTimeModule`: `LocalDateTime` 직렬화 지원
- `kotlinModule`: Kotlin data class 직렬화 지원
- `entryTtl(Duration.ofHours(1))`: 기존 Caffeine과 동일한 1시간 TTL
- `maximumSize` 제거: Redis는 메모리 관리를 자체적으로 하므로 불필요

- [ ] **Step 2: 컴파일 확인**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :core:compileKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
cd /Users/allen/projects/giwon-blog-api
git add core/src/main/kotlin/com/giwon/blog/core/config/CacheConfig.kt
git commit -m "feat: CacheConfig를 Caffeine에서 Redis로 교체"
```

---

### Task 4: application.yml에 Redis 연결 설정 추가

**Files:**
- Modify: `api-blog/src/main/resources/application.yml`
- Modify: `api-admin/src/main/resources/application.yml`

- [ ] **Step 1: api-blog application.yml에 Redis 설정 추가**

`api-blog/src/main/resources/application.yml`의 `spring:` 하위에 추가:

```yaml
spring:
  application:
    name: giwon-blog-api
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
  datasource:
    # ... 기존 그대로
```

- [ ] **Step 2: api-admin application.yml에 Redis 설정 추가**

`api-admin/src/main/resources/application.yml`의 `spring:` 하위에 추가:

```yaml
spring:
  application:
    name: giwon-blog-admin-api
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
  servlet:
    # ... 기존 그대로
```

- [ ] **Step 3: Commit**

```bash
cd /Users/allen/projects/giwon-blog-api
git add api-blog/src/main/resources/application.yml api-admin/src/main/resources/application.yml
git commit -m "feat: application.yml에 Redis 연결 설정 추가"
```

---

### Task 5: docker-compose에 Redis 컨테이너 추가

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Redis 서비스 추가 + 환경변수 연결**

`docker-compose.yml`의 `services:` 아래에 Redis 추가, api-blog과 api-admin에 `REDIS_HOST` 환경변수 추가:

`services.postgres` 아래에 redis 서비스 추가:

```yaml
  redis:
    image: redis:7-alpine
    container_name: giwon-blog-redis
    restart: unless-stopped
    expose:
      - "6379"
    networks:
      - blog-network
    volumes:
      - redis-data:/data
```

`volumes:` 섹션에 추가:

```yaml
volumes:
  postgres-data:
  blog-images:
  redis-data:
```

`x-api-blog`의 `environment:`에 추가:

```yaml
    REDIS_HOST: giwon-blog-redis
```

`x-api-admin`의 `environment:`에 추가:

```yaml
    REDIS_HOST: giwon-blog-redis
```

`x-api-blog`과 `x-api-admin`의 `depends_on:`에 redis 추가:

```yaml
  depends_on:
    - postgres
    - redis
```

- [ ] **Step 2: docker-compose.override.yml에 Redis 포트 노출 (로컬 개발용)**

`docker-compose.override.yml`에 추가:

```yaml
  redis:
    ports:
      - "6379:6379"
```

- [ ] **Step 3: Commit**

```bash
cd /Users/allen/projects/giwon-blog-api
git add docker-compose.yml docker-compose.override.yml
git commit -m "infra: docker-compose에 Redis 컨테이너 추가"
```

---

### Task 6: 통합 테스트에 Redis Testcontainer 추가

**Files:**
- Modify: `api-blog/build.gradle.kts`
- Modify: `api-admin/build.gradle.kts`
- Modify: `api-blog/src/test/kotlin/com/giwon/blog/api/config/TestContainersConfig.kt`
- Modify: `api-admin/src/test/kotlin/com/giwon/blog/admin/config/TestContainersConfig.kt`

통합 테스트가 Testcontainers로 PostgreSQL을 띄우듯이, Redis도 Testcontainer로 띄워야 한다.

- [ ] **Step 1: 현재 TestContainersConfig 확인**

먼저 기존 TestContainersConfig 파일 내용을 확인한다:

Run: `cat /Users/allen/projects/giwon-blog-api/api-blog/src/test/kotlin/com/giwon/blog/api/config/TestContainersConfig.kt`
Run: `cat /Users/allen/projects/giwon-blog-api/api-admin/src/test/kotlin/com/giwon/blog/admin/config/TestContainersConfig.kt`

- [ ] **Step 2: build.gradle.kts에 Redis Testcontainer 의존성 추가**

`api-blog/build.gradle.kts`와 `api-admin/build.gradle.kts` 모두에 추가:

```kotlin
testImplementation("com.redis:testcontainers-redis:2.2.4")
```

- [ ] **Step 3: api-blog TestContainersConfig에 Redis 컨테이너 추가**

기존 PostgreSQL 컨테이너 설정 옆에 Redis 컨테이너를 추가한다. 패턴은 PostgreSQL과 동일하게:

```kotlin
import com.redis.testcontainers.RedisContainer

// 기존 PostgreSQL 컨테이너 옆에 추가:
val redis = RedisContainer("redis:7-alpine")

// @DynamicPropertySource 메서드 내에 추가:
registry.add("spring.data.redis.host") { redis.host }
registry.add("spring.data.redis.port") { redis.firstMappedPort }
```

`redis.start()` 호출도 PostgreSQL과 같은 위치에 추가.

- [ ] **Step 4: api-admin TestContainersConfig에도 동일하게 Redis 컨테이너 추가**

api-blog과 동일한 방식으로 추가.

- [ ] **Step 5: 통합 테스트 실행**

Run: `cd /Users/allen/projects/giwon-blog-api && ./gradlew :api-blog:test :api-admin:test`
Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
cd /Users/allen/projects/giwon-blog-api
git add api-blog/build.gradle.kts api-admin/build.gradle.kts \
        api-blog/src/test/kotlin/com/giwon/blog/api/config/TestContainersConfig.kt \
        api-admin/src/test/kotlin/com/giwon/blog/admin/config/TestContainersConfig.kt
git commit -m "test: 통합 테스트에 Redis Testcontainer 추가"
```

---

### Task 7: CLAUDE.md 업데이트

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 기술 스택과 캐시 관련 설명 업데이트**

`CLAUDE.md`에서:

기술 스택 섹션의 `Caffeine Cache`를 `Redis 7`로 변경.

캐시 전략 설명에서 `(Caffeine)` → `(Redis)` 변경.

하단 캐시 섹션 변경:
```markdown
### 캐시
- CacheManager(Spring 추상화) 사용, 구현체는 CacheConfig에서 교체
- 현재: Redis (api-blog, api-admin 공유 캐시)
```

Docker 섹션에 Redis 추가:
```markdown
docker compose up -d postgres redis
```

- [ ] **Step 2: Commit**

```bash
cd /Users/allen/projects/giwon-blog-api
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 캐시 설명을 Redis로 업데이트"
```
