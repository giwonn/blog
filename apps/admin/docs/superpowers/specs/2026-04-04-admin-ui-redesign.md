# 블���그 어드민 UI 리디자인 스펙

## 개요

Ghost 스타일의 미니멀 어드민 패널로 리디자인. 글 상태(임시저장/예약/발행) 개념 도입, 대시보드 통계, 풀스크린 에디터.

## 글 상태

3단계: `DRAFT` → `SCHEDULED` → `PUBLISHED`

- **DRAFT**: 임시저장. 블로그에 노출 안 됨.
- **SCHEDULED**: 예약 발행. `publishedAt` 시각이 지나면 자동으로 PUBLISHED로 변경.
- **PUBLISHED**: 발행됨. 블로그에 노출.

## 레이아웃

### 사이드바 (좌측 고정)

```
Blog Admin
──────────
📊 대시보드
📝 글 관리
���� 분석
⚙️ 설정
```

- 4개 항목, 평탄한 구조
- 아이콘 + 라벨
- 반응형: 좁은 화면에서 아이콘만 표시 (w-16)
- 현재 페이지 하이라이트

### 헤더 (상단 고정)

- 좌측: 현재 페이지 제목
- 우측: **[+ 새 �� 작성]** 버튼 (항상 노출)

### 에디터 모드

- 사이드바/헤더 숨김, 풀스크린
- 좌측 상단: ← 뒤로가기
- 우측 상단: 자동저장 상태 + [임시저장] + [발행] 버튼
- 발행 클릭 시: 우측에서 슬라이드인 패널
  - 즉시 발행 / 예약 발행 선택
  - 예약 시 날짜/시간 피커
  - [발행하기] 확인 버튼

## 페이지별 설계

### 대시보드 (`/`)

| 영역 | 내용 |
|------|------|
| 방문자 카드 | 오늘/어제/총 방문자 (3칸 그리드) |
| 추세선 | 최근 30일 페이지뷰 스파크라인 차트 |
| 최근 글 | 최근 5개 글 + 상태 배지 + 날짜 |

데이터 소스:
- 방문자: `GET /admin/analytics/overview` (기존)
- 최근 글: `GET /admin/articles?size=5` (기존)

### 글 관리 (`/articles`)

| 영역 | 내용 |
|------|------|
| 필터 탭 | [전체] [발행] [임시저장] [예약] |
| 글 목록 | 제목 + 상태 배지 + 날짜 + 조회수 |
| 페이지네이션 | 하단 |

- 상태 배지: 발행(초록), 임시저장(회색), 예약(노랑)
- 제목 클릭 → `/articles/{id}` (상세 페이지)

### 글 상세 (`/articles/{id}`)

| 영역 | 내용 |
|------|------|
| 헤더 | 제목 + [수정] [삭제] 버튼 |
| 글 정보 카드 | ID, 상태, 작성일, 수정일, 글자 수 |
| 본문 미리보기 | 마크다운 렌더링 또는 텍스트 500자 |
| 통계 사이드 | 해당 글의 조회수 (데이터 수집 후) |

### 글 작성/수정 (`/articles/new`, `/articles/{id}/edit`)

- ��스크린 레이아웃 (사이드바 없음)
- Tiptap 에디터 (기존)
- 자동 저장: 10초마다 또는 내용 변경 시 DRAFT로 자동 저장
- 저장 상태 표시: "저장됨" / "저장 중..." / "변경사항 있음"
- 발행 슬라이드인 패널:
  - 즉시 발행: 바로 PUBLISHED
  - 예약 발행: 날짜/시간 선택 → SCHEDULED

### 분석 (`/analytics`)

기존 유지. 날짜 범위 선택 + 개요 카드 + 일별 차트 + 인기 페이지 + 유입 경로.

## 백엔드 변경

### Article 엔티티

```kotlin
@Entity
class Article(
    // 기존 필드...
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: ArticleStatus = ArticleStatus.DRAFT,

    var publishedAt: LocalDateTime? = null,
)

enum class ArticleStatus {
    DRAFT, SCHEDULED, PUBLISHED
}
```

### API 변경

**api-admin:**

| Method | Path | 변경사항 |
|--------|------|---------|
| POST | /admin/articles | `status` 파라미터 추가 (기본 DRAFT) |
| PUT | /admin/articles/{id} | `status`, `publishedAt` 파라미터 추가 |
| PUT | /admin/articles/{id}/publish | 즉시 발행 |
| PUT | /admin/articles/{id}/schedule | 예약 발행 (`publishedAt` 필수) |
| GET | /admin/articles | `status` 필터 파라미터 추가 |

**api-blog:**
- `GET /articles`: `WHERE status = 'PUBLISHED'` 조건 추가 (기존 전체 조회 → 발행된 것만)

### 스케줄러 추가

`ArticlePublishScheduler`: 매분 실행. `SCHEDULED` + `publishedAt <= now()` 인 글을 `PUBLISHED`로 변경.

## 프론트엔드 변경

### 새 컴포넌트

- `PublishPanel.tsx`: 발행 슬라이드인 패널 (즉시/예약 선택)
- `StatusBadge.tsx`: 상태 배지 (DRAFT=회색, SCHEDULED=노랑, PUBLISHED=초록)
- `AutoSaveIndicator.tsx`: 자동 저장 상태 표시
- `SparklineChart.tsx`: 스파크라인 차트 (대시보드용)

### 수정할 컴포넌트

- `Sidebar.tsx`: 메뉴 항목 변경 (4개), 반응형 축소
- `layout.tsx`: 에디터 페이지에서 사이드바 숨김 처리
- `page.tsx` (대시보드): 통계 카드 + 최근 글 목록
- `articles/page.tsx`: 상태 필터 탭 + 배지
- `articles/new/page.tsx`: 풀스크린 + 자동저장 + 발행 패널
- `articles/[id]/edit/page.tsx`: 동일
- `articles/[id]/page.tsx`: 글 정보 + 통계

### Server Actions 추가

- `publishArticle(id)`: 즉시 발행
- `scheduleArticle(id, publishedAt)`: 예약 발행
- `getArticles(status?, page, size)`: 상태 필터 추가
