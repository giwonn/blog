# 블로그 Admin

블로그 관리자용 Admin 프로젝트

## 기술 스택

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- NextAuth.js (구글 OAuth)
- Tiptap (마크다운 에디터)

## 디렉토리 구조

```
src/
├── app/           # 페이지 라우트
├── components/    # 재사용 컴포넌트
│   ├── editor/    # Tiptap 에디터 관련
│   ├── layout/    # Header, Sidebar
│   └── providers/ # Context Providers
├── lib/           # 유틸리티 함수
└── types/         # 타입 정의
```

## 컨벤션

### 네이밍
- 컴포넌트: PascalCase (예: `TiptapEditor.tsx`)
- 함수/변수: camelCase
- 타입/인터페이스: PascalCase

### import 방식
- 절대 경로 사용: `@/*` (예: `@/components/editor/TiptapEditor`)

## 명령어

```bash
npm run dev    # 개발 서버 (localhost:3000)
npm run build  # 프로덕션 빌드
npm run start  # 프로덕션 서버
npm run lint   # ESLint 실행
```

## API 개발 방식

- giwon-blog 프로젝트와 동일한 컨벤션 유지
- API 공통 응답 포맷: `ApiResponse<T>`
