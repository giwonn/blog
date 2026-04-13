# Blog Monorepo — Root Guide

This repository is the **monorepo root** for the giwon.dev blog ecosystem. Project name: `blog`.

## ⚠️ Path Rules (Highest Priority)

1. **All git commands run from the monorepo root (`~/github/new-blog`).**
   Never `cd` into a subproject to run `git status`, `git add`, or `git commit`.
   One working change across multiple apps = one commit at the root.
2. **Build/test/run commands run from inside the relevant subfolder** — or via `turbo run ... --filter=<app>` from the root.
   Example: `(cd apps/blog && bun run dev)` or `bun run dev:blog`.
3. **Always `pwd` before risky commands.** If unsure, use absolute paths.
4. **Never use destructive commands (`rm -rf`, `git reset --hard`, `git clean -fd`) without explicit user confirmation.**

## 📁 Layout

```
apps/
  blog/    — blog.giwon.dev  (Next.js 16 + React 19 + MDX + Tailwind 4)   [:3000]
  admin/   — admin.giwon.dev (Next.js 16 + Shadcn/ui + Tiptap + NextAuth) [:3000]
  api/     — giwon-blog-api  (Spring Boot 3.5 + Kotlin + PostgreSQL + Redis, LEGACY — to be rewritten to Hono+Bun)
packages/  — (empty) future shared types, UI, config
```

## 🔗 How the Apps Talk

```
 [apps/blog]  ──HTTP──▶  [apps/api :8080]  ◀── PostgreSQL / Redis
 [apps/admin] ──HTTP──▶  [apps/api :8081]
       │
       └─ Google OAuth (NextAuth)
```

Backend responses use a shared `ApiResponse<T>` envelope (in `apps/api/common`).

## 🛠️ Common Commands

All run from the monorepo root unless noted.

```bash
# Install everything (first time + whenever deps change)
bun install

# Dev servers
bun run dev:blog       # apps/blog on :3000
bun run dev:admin      # apps/admin on :3000 (run one at a time, or change port)
(cd apps/api && docker compose up -d postgres redis && ./gradlew :api-blog:bootRun)

# Build
bun run build:blog
bun run build:admin
(cd apps/api && ./gradlew clean build -x test)

# Lint / test
bun run lint
bun run test
```

## ✍️ Commit Conventions (important — read before committing)

We use **Conventional Commits with a required scope**. The scope identifies which app or area was changed.

**Format:** `type(scope): subject`

**Allowed scopes:**
- `blog`   — changes under `apps/blog/`
- `admin`  — changes under `apps/admin/`
- `api`    — changes under `apps/api/`
- `root`   — monorepo infra (package.json, turbo.json, CLAUDE.md, .gitignore, CI)
- `pkg`    — changes under `packages/*`

**Allowed types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `style`, `build`, `ci`.

**Examples:**
```
feat(blog): add table of contents to MDX layout
fix(admin): resolve redirect loop after Google OAuth
refactor(api): extract ArticleReader to domain layer
chore(root): bump turbo to 2.4.0
```

**Rules:**
- **One commit touches one scope when possible.** If you must touch two scopes, split into two commits unless they form a single atomic change.
- Scope matters for `git log -- apps/<scope>/` filtering — keep it clean.

## 🔍 Per-Project History

Because this is a single git repo, use path filters to see per-project history:

```bash
git log --oneline -- apps/blog/
git log --oneline -- apps/admin/
git log --oneline -- apps/api/
```

The three original repos (`blog.giwon.dev`, `admin.giwon.dev`, `giwon-blog-api`) are archived on GitHub and preserve the pre-monorepo history.

## 🤖 For Claude Code Specifically

- Read this file at the start of every session.
- Before running `git` commands, confirm `pwd` is `~/github/new-blog` (or use `git -C ~/github/new-blog ...`).
- Before running `bun`/`turbo`, decide: is this a root command or a subfolder command?
- Prefer `turbo run <task> --filter=<app>` from the root over `cd apps/<app> && ...`.
- When in doubt about a destructive operation, stop and ask the user.

See each `apps/*/CLAUDE.md` for subproject-specific conventions.
