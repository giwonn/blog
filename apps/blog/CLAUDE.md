# 블로그 개발

## 참고할 Claude Skills

- 기능 개발 / 리팩토링 : coding-convention.md, architecture.md
- 서버와의 통신을 위한 API 개발 : new-api.md

## 기술 스택

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- MDX (next-mdx-remote)
- next-themes (다크모드)

## 디렉토리 구조
- FSD Architecture 참고
```
src/
├── actions/       # Server Actions
├── app/           # 페이지 라우트
├── components/    # 재사용 컴포넌트
│   ├── layout/    # Header, Footer
│   ├── mdx/       # MDX 관련 (CodeBlock, Mermaid, TOC)
│   ├── providers/ # Context Providers
│   └── ui/        # 공통 UI 컴포넌트
├── features/      # 기능별 모듈
├── lib/           # 유틸리티 함수
└── types/         # 타입 정의
```

## 명령어

```bash
npm run dev    # 개발 서버 (localhost:3000)
npm run build  # 프로덕션 빌드
npm run start  # 프로덕션 서버
npm run lint   # ESLint 실행
```