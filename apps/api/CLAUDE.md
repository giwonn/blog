# giwon-blog-api

블로그 시스템의 백엔드 API. 블로그 프론트(giwon-blog)와 어드민 프론트(giwon-blog-admin)가 바라보는 서버.

## 기술 스택

- Spring Boot 3.5.12 (Kotlin 2.1.21)
- Java 21
- Gradle (Kotlin DSL)
- PostgreSQL 17
- QueryDSL 5.1.0
- Redis 7
- Docker + Jenkins CI/CD

## 모듈 구조

```
giwon-blog-api/
├── common/      # 공유 DTO (ApiResponse), 예외 (BusinessException, ErrorCode)
├── core/        # 도메인 로직, 엔티티, 인프라 구현체
├── api-blog/    # 블로그용 API (port 8080) - 글 조회 전용
└── api-admin/   # 어드민용 API (port 8081) - 전체 CRUD + 분석
```

## 아키텍처: 레이어드 DIP

각 도메인은 application / domain / infrastructure 레이어로 나뉜다.

```
application/     → 유스케이스, 캐시, 트랜잭션 조합 (Service)
domain/          → 엔티티, 비즈니스 규칙 (DomainService), Reader/Writer 인터페이스
infrastructure/
├── persistence/ → JPA Repository, QueryDSL, Reader/Writer 구현체
└── storage/     → 파일 저장 구현체
```

**의존 방향**: `infrastructure → domain ← application`
- application과 domain은 infrastructure를 모르고, 인터페이스에만 의존
- infrastructure만 구체적인 기술(JPA, QueryDSL)을 알고 있음

## 도메인별 구조와 전략

### article (게시글)

```
article/
├── application/
│   └── ArticleService.kt        # 유스케이스 + 캐시 관리
├── domain/
│   ├── Article.kt                # 엔티티
│   ├── ArticleDomainService.kt   # 이미지 처리 비즈니스 규칙
│   ├── ArticleReader.kt          # 읽기 인터페이스
│   └── ArticleWriter.kt          # 쓰기 인터페이스
└── infrastructure/persistence/
    ├── ArticleJpaRepository.kt   # Spring Data JPA
    ├── JpaArticleReader.kt       # ArticleReader 구현
    └── JpaArticleWriter.kt       # ArticleWriter 구현
```

**캐시 전략 (Redis):**
- 읽기: Look-aside (캐시 확인 → miss면 DB → 캐시 저장)
- 작성: Write-Through (DB 저장 + 캐시 저장) - 최신글이 맨 위에 뜨니까
- 수정: Write-Around (DB만 업데이트 + 캐시 무효화)
- 삭제: DB 삭제 + 캐시 무효화

**이미지 처리:**
- 에디터에서 base64로 임시 삽입 → 글 저장 시 서버에서 base64 추출 → 로컬 디스크 저장 → URL 치환
- 수정 시: 삭제된 이미지 정리 (old URL - new URL)
- 삭제 시: 글의 모든 이미지 삭제
- ImageStorage 인터페이스로 DIP (현재: LocalImageStorage, 나중에 R2 등으로 교체 가능)

### analytics (분석/통계)

```
analytics/
├── application/
│   ├── AnalyticsCollectionService.kt  # 페이지뷰 기록 (@Async)
│   ├── AnalyticsQueryService.kt       # 어드민용 통계 조회
│   ├── PopularArticleService.kt       # 인기글 Top 5
│   └── VisitorStatsService.kt         # 방문자 UV (총/오늘/어제)
├── domain/
│   ├── AnalyticsReader.kt             # 읽기 인터페이스 + DTO
│   ├── AnalyticsWriter.kt             # 쓰기 인터페이스
│   ├── PageView.kt                    # 페이지뷰 엔티티
│   ├── VisitorSession.kt              # 방문자 세션 엔티티
│   ├── ArticleStats.kt                # 30일 롤링 집계
│   ├── DailyArticleStats.kt           # 일일 글 조회수 집계
│   └── DailyVisitorStats.kt           # 일일 UV 집계
├── infrastructure/persistence/
│   ├── QueryDslAnalyticsReader.kt     # AnalyticsReader 구현 (QueryDSL + JPA)
│   ├── JpaAnalyticsWriter.kt          # AnalyticsWriter 구현 (JPA)
│   └── *JpaRepository.kt             # Spring Data JPA 레포지토리들
└── scheduler/
    ├── ArticleStatsAggregator.kt      # 매일 03:00 - 일일 집계 + 30일 롤링
    └── VisitorStatsAggregator.kt      # 매일 03:05 - 일일 UV 집계
```

**Reader/Writer 패턴:**
- AnalyticsReader: 하나의 구현체에서 QueryDSL(복잡한 집계)과 JPA(단순 조회) 혼용
- AnalyticsWriter: JPA로 저장
- 서비스는 인터페이스만 알고, JPA인지 QueryDSL인지 모름

**배치 집계 전략:**
- 매일 새벽 어제 하루치만 집계 → daily_article_stats에 저장
- daily_article_stats 최근 30일분 SUM → article_stats에 저장 (롤링)
- API는 article_stats에서 SELECT만 → 빠름

**방문자 추적 (티스토리 방식 UV):**
- 세션 쿠키(blog-session)로 고유 방문자 식별
- 쿠키 만료: 매일 00시 (자정까지 남은 초 동적 계산)
- 블로그 노출: 총/오늘/어제 UV

### comment (댓글)

```
comment/
└── application/
    └── GitHubCommentService.kt   # GitHub Issues API로 최신 댓글 조회
```

- 댓글 시스템: Utterances (GitHub Issues 기반, 백엔드 댓글 API 없음)
- 최신 댓글 5개: GitHub API 호출 + Caffeine 캐시

### image (이미지)

```
image/
├── domain/
│   └── ImageStorage.kt                    # 인터페이스
└── infrastructure/storage/
    └── LocalImageStorage.kt               # 로컬 디스크 구현체
```

- DIP: ImageStorage 인터페이스만 의존, 구현체 교체 가능 (R2, S3 등)

## API 엔드포인트

**api-blog (8080) - 외부 노출 안 됨, Next.js SSR에서만 호출:**

| Method | Path | 설명 |
|--------|------|------|
| GET | /articles | 글 목록 (페이지네이션) |
| GET | /articles/{id} | 글 상세 |
| GET | /sidebar/popular-articles | 인기글 Top 5 |
| GET | /sidebar/recent-comments | 최신 댓글 5개 |
| GET | /sidebar/visitors | 방문자 UV (총/오늘/어제) |

**api-admin (8081) - 외부 노출 안 됨, 어드민 Next.js SSR에서만 호출:**

| Method | Path | 설명 |
|--------|------|------|
| GET | /admin/articles | 글 목록 |
| GET | /admin/articles/{id} | 글 상세 |
| POST | /admin/articles | 글 작성 |
| PUT | /admin/articles/{id} | 글 수정 |
| DELETE | /admin/articles/{id} | 글 삭제 |
| GET | /admin/analytics/overview | 대시보드 통계 |
| GET | /admin/analytics/page-views | 기간별 페이지뷰 |
| GET | /admin/analytics/top-pages | 인기 페이지 |
| GET | /admin/analytics/referrers | 유입 경로 |

## 컨벤션

### 네이밍
- 패키지: 소문자 (예: `article`, `analytics`)
- 클래스: PascalCase
- 함수/변수: camelCase
- 인터페이스: 접두사 없음 (예: `ArticleReader`, NOT `IArticleReader`)

### 새 기능 추가 시
1. **TDD**: 테스트를 먼저 작성하고 구현
2. **레이어 순서**: domain 인터페이스 → application 서비스 → infrastructure 구현체
3. **DIP 준수**: 서비스는 인터페이스에만 의존, 구현 기술은 infrastructure에 격리

### Reader/Writer 패턴
- 모든 도메인의 데이터 접근은 Reader(읽기) / Writer(쓰기) 인터페이스를 통해서
- Reader/Writer는 domain 패키지에 위치
- 구현체는 infrastructure/persistence에 위치
- 하나의 구현체에서 JPA(단순)와 QueryDSL(복잡) 혼용 가능

### 캐시
- CacheManager(Spring 추상화) 사용, 구현체는 CacheConfig에서 교체
- 현재: Redis (api-blog, api-admin 공유 캐시)

## 명령어

```bash
./gradlew clean build -x test   # 전체 빌드
./gradlew :core:test            # core 테스트
./gradlew :api-blog:bootRun     # 블로그 API 실행 (8080)
./gradlew :api-admin:bootRun    # 어드민 API 실행 (8081)
```

## Docker

```bash
# 로컬 개발 (override 자동 적용 → 포트 열림)
docker compose up -d postgres redis
./gradlew :api-blog:bootRun

# 배포 (override 무시 → 포트 안 열림, 내부 통신만)
docker compose -f docker-compose.yml up -d
```

## API 공통 응답 포맷

```json
{ "data": T }
```

giwon-blog-admin 프로젝트와 동일한 `ApiResponse<T>` 사용.
