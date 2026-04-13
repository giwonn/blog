# Blog Monorepo Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a fresh Turborepo monorepo at `~/github/new-blog` (project name `blog`) that contains `apps/blog`, `apps/admin`, and `apps/api` imported from the three existing repos, with new git history and shared tooling.

**Architecture:** New git repo, Bun workspaces for `apps/blog` and `apps/admin` (Next.js), Turborepo as task orchestrator. `apps/api` is imported as-is (Spring Boot/Kotlin/Gradle) and lives **outside** the Bun workspace (Gradle manages itself); it will be rewritten to Hono+Bun in a later plan. Files are copied from existing repos (excluding `.git`, `node_modules`, build outputs) so the new repo starts with a clean single history.

**Tech Stack:** Turborepo, Bun (package manager), Next.js 16 + React 19 + TypeScript (blog, admin), Spring Boot + Kotlin + Gradle (api, legacy until rewrite).

---

## Scope Check

This plan covers ONLY monorepo scaffolding + file import + verification. The API rewrite (Kotlin → Hono+Bun) is a separate, larger initiative and will have its own plan. Do not attempt API rewrite as part of this plan.

## File Structure

Final layout after this plan completes:

```
~/github/new-blog/
├── .git/                           # fresh history
├── .gitignore                      # root
├── package.json                    # name: "blog", workspaces, turbo scripts
├── turbo.json                      # task pipeline
├── bun.lockb                       # after bun install
├── CLAUDE.md                       # root guide: paths, commit rules, layout
├── apps/
│   ├── blog/                       # ex blog.giwon.dev (Next.js)
│   │   ├── package.json            # name: "@blog/web" (to be renamed)
│   │   ├── CLAUDE.md               # copied from source repo, touched up
│   │   └── ... (src, public, etc.)
│   ├── admin/                      # ex admin.giwon.dev (Next.js)
│   │   ├── package.json            # name: "@blog/admin"
│   │   ├── CLAUDE.md
│   │   └── ...
│   └── api/                        # ex giwon-blog-api (Gradle, Kotlin)
│       ├── build.gradle.kts
│       ├── CLAUDE.md
│       └── ... (common/, core/, api-blog/, api-admin/)
├── packages/                       # empty placeholder; future shared code
│   └── .gitkeep
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-04-13-monorepo-setup.md  # this file
```

**Responsibilities:**
- Root `package.json` — declares workspaces (`apps/blog`, `apps/admin`, `packages/*` — note `apps/api` is EXCLUDED), defines cross-workspace turbo scripts.
- `turbo.json` — task graph for build/dev/lint/test.
- Root `CLAUDE.md` — path rules (git from root, builds from subfolder), commit conventions (`feat(blog):`, etc.), layout, common commands.
- `apps/*` — independent projects, kept close to their original structure.
- `packages/` — placeholder for future shared types/config/UI; seeded with `.gitkeep` so the directory exists.

---

## Task 1: Verify prerequisites and target directory state

**Files:**
- Inspect: `~/github/new-blog/`
- Inspect: `~/github/blog/blog.giwon.dev/`, `~/github/blog/admin.giwon.dev/`, `~/github/blog/giwon-blog-api/`

- [ ] **Step 1: Verify tool versions**

Run:
```bash
bun --version
git --version
```
Expected: `bun` 1.x, `git` 2.x. If `bun` is missing, STOP and install it (`curl -fsSL https://bun.sh/install | bash`) before proceeding.

- [ ] **Step 2: Verify source repos are clean**

Run:
```bash
for d in blog.giwon.dev admin.giwon.dev giwon-blog-api; do
  echo "=== $d ==="
  git -C ~/github/blog/$d status --short
  git -C ~/github/blog/$d branch --show-current
done
```
Expected: all three on `main`, zero modified/untracked lines. If any repo is dirty, STOP and ask the user.

- [ ] **Step 3: Verify target directory exists but is empty (except docs/)**

Run:
```bash
ls -la ~/github/new-blog
```
Expected: only `.`, `..`, `docs/`. If other files exist, STOP.

---

## Task 2: Initialize git in the monorepo root

**Files:**
- Create: `~/github/new-blog/.git/` (via `git init`)

- [ ] **Step 1: Run git init with main as default branch**

Run:
```bash
cd ~/github/new-blog && git init -b main
```
Expected: `Initialized empty Git repository in /home/l4279625/github/new-blog/.git/`

- [ ] **Step 2: Verify**

Run:
```bash
git -C ~/github/new-blog status
git -C ~/github/new-blog branch --show-current
```
Expected: "On branch main", "No commits yet", branch name `main`.

---

## Task 3: Create root .gitignore

**Files:**
- Create: `~/github/new-blog/.gitignore`

- [ ] **Step 1: Write .gitignore**

Write to `~/github/new-blog/.gitignore`:

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.next/
out/
.turbo/

# Bun
bun.lockb.tmp

# Gradle / JVM
.gradle/
**/build/
*.class
*.jar
!gradle/wrapper/gradle-wrapper.jar

# Environment
.env
.env.local
.env.*.local
!.env.example

# IDE
.idea/
.vscode/
*.iml
.DS_Store

# Logs
*.log
npm-debug.log*
yarn-debug.log*

# Test / coverage
coverage/
.nyc_output/
playwright-report/
test-results/
```

- [ ] **Step 2: Verify the file was written**

Run:
```bash
wc -l ~/github/new-blog/.gitignore
```
Expected: ~40 lines.

---

## Task 4: Create root package.json

**Files:**
- Create: `~/github/new-blog/package.json`

- [ ] **Step 1: Write package.json**

Write to `~/github/new-blog/package.json`:

```json
{
  "name": "blog",
  "private": true,
  "version": "0.0.0",
  "description": "giwon.dev blog monorepo (blog, admin, api)",
  "workspaces": [
    "apps/blog",
    "apps/admin",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "dev:blog": "turbo run dev --filter=blog",
    "dev:admin": "turbo run dev --filter=admin",
    "build:blog": "turbo run build --filter=blog",
    "build:admin": "turbo run build --filter=admin"
  },
  "devDependencies": {
    "turbo": "^2.3.0"
  },
  "packageManager": "bun@1.1.0",
  "engines": {
    "node": ">=20"
  }
}
```

Note: `apps/api` is intentionally NOT in `workspaces` — it is a Gradle project and has no `package.json`.

- [ ] **Step 2: Validate JSON syntax**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('$HOME/github/new-blog/package.json','utf8')); console.log('OK')"
```
Expected: `OK`

---

## Task 5: Create turbo.json

**Files:**
- Create: `~/github/new-blog/turbo.json`

- [ ] **Step 1: Write turbo.json**

Write to `~/github/new-blog/turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": ["NODE_ENV"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('$HOME/github/new-blog/turbo.json','utf8')); console.log('OK')"
```
Expected: `OK`

---

## Task 6: Create packages/ placeholder

**Files:**
- Create: `~/github/new-blog/packages/.gitkeep`

- [ ] **Step 1: Create directory and .gitkeep**

Run:
```bash
mkdir -p ~/github/new-blog/packages && touch ~/github/new-blog/packages/.gitkeep
```

- [ ] **Step 2: Verify**

Run:
```bash
ls -la ~/github/new-blog/packages
```
Expected: contains `.gitkeep`.

---

## Task 7: Write root CLAUDE.md (monorepo guide)

**Files:**
- Create: `~/github/new-blog/CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md**

Write to `~/github/new-blog/CLAUDE.md`:

```markdown
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
```

- [ ] **Step 2: Verify**

Run:
```bash
wc -l ~/github/new-blog/CLAUDE.md
```
Expected: ~90+ lines.

---

## Task 8: Initial commit (scaffold only, before importing apps)

**Files:**
- Commit: scaffold files created in Tasks 3–7

- [ ] **Step 1: Stage scaffold files**

Run:
```bash
cd ~/github/new-blog && git add .gitignore package.json turbo.json CLAUDE.md packages/.gitkeep docs/
```

- [ ] **Step 2: Verify what's staged**

Run:
```bash
git -C ~/github/new-blog status --short
```
Expected: `A  .gitignore`, `A  CLAUDE.md`, `A  docs/superpowers/plans/2026-04-13-monorepo-setup.md`, `A  package.json`, `A  packages/.gitkeep`, `A  turbo.json`. Nothing else.

- [ ] **Step 3: Commit**

Run:
```bash
git -C ~/github/new-blog commit -m "chore(root): initialize blog monorepo scaffold

- Turborepo + Bun workspaces (apps/blog, apps/admin, packages/*)
- Root CLAUDE.md with path rules and commit conventions
- apps/api will be imported next but stays outside Bun workspace (Gradle)"
```
Expected: commit succeeds, 1 commit on `main`.

- [ ] **Step 4: Verify**

Run:
```bash
git -C ~/github/new-blog log --oneline
```
Expected: one line containing `chore(root): initialize blog monorepo scaffold`.

---

## Task 9: Import apps/blog from blog.giwon.dev

**Files:**
- Create: `~/github/new-blog/apps/blog/` (copy from `~/github/blog/blog.giwon.dev/`, excluding `.git`, `node_modules`, `.next`)

- [ ] **Step 1: Copy source files**

Run:
```bash
mkdir -p ~/github/new-blog/apps/blog
rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.turbo/' \
  --exclude='out/' \
  --exclude='playwright-report/' \
  --exclude='test-results/' \
  ~/github/blog/blog.giwon.dev/ ~/github/new-blog/apps/blog/
```

- [ ] **Step 2: Verify key files present**

Run:
```bash
ls ~/github/new-blog/apps/blog/package.json ~/github/new-blog/apps/blog/next.config.ts ~/github/new-blog/apps/blog/src/app/page.tsx
```
Expected: all three paths exist.

- [ ] **Step 3: Verify .git was NOT copied**

Run:
```bash
test ! -e ~/github/new-blog/apps/blog/.git && echo "OK: no .git"
```
Expected: `OK: no .git`

- [ ] **Step 4: Stage and commit**

Run:
```bash
cd ~/github/new-blog && git add apps/blog && git commit -m "feat(blog): import blog.giwon.dev source

Imported from github.com/giwonn/blog.giwon.dev at commit 40b0652.
Full pre-monorepo history preserved in the archived source repo."
```
Expected: commit succeeds; many files added.

- [ ] **Step 5: Verify**

Run:
```bash
git -C ~/github/new-blog log --oneline -- apps/blog/ | head
```
Expected: one commit `feat(blog): import blog.giwon.dev source`.

---

## Task 10: Import apps/admin from admin.giwon.dev

**Files:**
- Create: `~/github/new-blog/apps/admin/` (copy from `~/github/blog/admin.giwon.dev/`)

- [ ] **Step 1: Copy source files**

Run:
```bash
mkdir -p ~/github/new-blog/apps/admin
rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.turbo/' \
  --exclude='out/' \
  --exclude='playwright-report/' \
  --exclude='test-results/' \
  --exclude='coverage/' \
  ~/github/blog/admin.giwon.dev/ ~/github/new-blog/apps/admin/
```

- [ ] **Step 2: Verify key files**

Run:
```bash
ls ~/github/new-blog/apps/admin/package.json ~/github/new-blog/apps/admin/next.config.ts ~/github/new-blog/apps/admin/src/app
test ! -e ~/github/new-blog/apps/admin/.git && echo "OK: no .git"
```
Expected: files exist; `OK: no .git`.

- [ ] **Step 3: Stage and commit**

Run:
```bash
cd ~/github/new-blog && git add apps/admin && git commit -m "feat(admin): import admin.giwon.dev source

Imported from github.com/giwonn/admin.giwon.dev at commit 8095cc6.
Full pre-monorepo history preserved in the archived source repo."
```
Expected: commit succeeds.

- [ ] **Step 4: Verify**

Run:
```bash
git -C ~/github/new-blog log --oneline -- apps/admin/ | head
```
Expected: one commit `feat(admin): import admin.giwon.dev source`.

---

## Task 11: Import apps/api from giwon-blog-api

**Files:**
- Create: `~/github/new-blog/apps/api/` (copy from `~/github/blog/giwon-blog-api/`)

- [ ] **Step 1: Copy source files**

Run:
```bash
mkdir -p ~/github/new-blog/apps/api
rsync -a \
  --exclude='.git/' \
  --exclude='.gradle/' \
  --exclude='build/' \
  --exclude='*/build/' \
  --exclude='**/build/' \
  --exclude='out/' \
  --exclude='.idea/' \
  ~/github/blog/giwon-blog-api/ ~/github/new-blog/apps/api/
```

- [ ] **Step 2: Verify key files**

Run:
```bash
ls ~/github/new-blog/apps/api/build.gradle.kts ~/github/new-blog/apps/api/settings.gradle.kts ~/github/new-blog/apps/api/api-blog ~/github/new-blog/apps/api/api-admin
test ! -e ~/github/new-blog/apps/api/.git && echo "OK: no .git"
```
Expected: all files exist; `OK: no .git`.

- [ ] **Step 3: Stage and commit**

Run:
```bash
cd ~/github/new-blog && git add apps/api && git commit -m "feat(api): import giwon-blog-api source

Imported from github.com/giwonn/giwon-blog-api at commit bec0bb8.
Full pre-monorepo history preserved in the archived source repo.
Note: api is a Gradle/Kotlin project and lives OUTSIDE the Bun workspace.
A future plan will rewrite this to Hono+Bun."
```
Expected: commit succeeds.

- [ ] **Step 4: Verify**

Run:
```bash
git -C ~/github/new-blog log --oneline -- apps/api/ | head
```
Expected: one commit `feat(api): import giwon-blog-api source`.

---

## Task 12: Remove stale lockfiles in blog and admin (Bun will create its own)

**Files:**
- Delete: `~/github/new-blog/apps/blog/package-lock.json` (if present)
- Delete: `~/github/new-blog/apps/blog/yarn.lock` (if present)
- Delete: `~/github/new-blog/apps/blog/pnpm-lock.yaml` (if present)
- Same for `apps/admin/`

- [ ] **Step 1: Check which lockfiles exist**

Run:
```bash
ls ~/github/new-blog/apps/blog/{package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lockb} 2>/dev/null
ls ~/github/new-blog/apps/admin/{package-lock.json,yarn.lock,pnpm-lock.yaml,bun.lockb} 2>/dev/null
```
Expected: shows whichever lockfiles exist. Note them.

- [ ] **Step 2: Remove non-bun lockfiles**

Run (only for files that actually exist):
```bash
cd ~/github/new-blog
rm -f apps/blog/package-lock.json apps/blog/yarn.lock apps/blog/pnpm-lock.yaml
rm -f apps/admin/package-lock.json apps/admin/yarn.lock apps/admin/pnpm-lock.yaml
```

- [ ] **Step 3: Commit the removal**

Run:
```bash
cd ~/github/new-blog
git add -u apps/blog apps/admin
git status --short
```
Expected: only deletions shown (`D  apps/blog/package-lock.json` etc.).

```bash
git commit -m "chore(root): remove non-bun lockfiles from apps/blog and apps/admin

Bun will generate a single root bun.lockb for the workspace."
```
If nothing to commit (no stale lockfiles existed), skip this step.

---

## Task 13: Run `bun install` at the root and verify workspace resolution

**Files:**
- Create: `~/github/new-blog/bun.lockb`
- Create: `~/github/new-blog/node_modules/`

- [ ] **Step 1: Install**

Run:
```bash
cd ~/github/new-blog && bun install
```
Expected: installs deps for `apps/blog`, `apps/admin`, and root. Creates `bun.lockb` at the root. No error about `apps/api` (which has no `package.json` and is not in workspaces).

If the install errors out due to workspace naming conflicts (both apps/blog and apps/admin might have the same `name` like `"my-app"` in their package.json), STOP and proceed to Task 14 first.

- [ ] **Step 2: Verify node_modules and lockfile**

Run:
```bash
ls ~/github/new-blog/node_modules/.bin/turbo ~/github/new-blog/bun.lockb
ls ~/github/new-blog/apps/blog/node_modules 2>/dev/null | head
```
Expected: `turbo` binary exists, `bun.lockb` exists.

- [ ] **Step 3: Commit the lockfile**

Run:
```bash
cd ~/github/new-blog && git add bun.lockb && git commit -m "chore(root): add bun.lockb after first install"
```

---

## Task 14: Fix workspace package names if they collide

**Files:**
- Modify: `~/github/new-blog/apps/blog/package.json` (`name` field)
- Modify: `~/github/new-blog/apps/admin/package.json` (`name` field)

This task only applies if Task 13 Step 1 errored, OR if both apps have the same or non-unique names. Turborepo's `--filter=<name>` uses the package name, so they must be distinct and match the scripts in the root `package.json` (`--filter=blog`, `--filter=admin`).

- [ ] **Step 1: Inspect current names**

Run:
```bash
node -e "console.log('blog:', require('$HOME/github/new-blog/apps/blog/package.json').name)"
node -e "console.log('admin:', require('$HOME/github/new-blog/apps/admin/package.json').name)"
```
Expected: shows current names.

- [ ] **Step 2: Set names to `blog` and `admin`**

Edit `~/github/new-blog/apps/blog/package.json`: set `"name": "blog"` (replace whatever is there).
Edit `~/github/new-blog/apps/admin/package.json`: set `"name": "admin"`.

- [ ] **Step 3: Re-run install**

Run:
```bash
cd ~/github/new-blog && bun install
```
Expected: success.

- [ ] **Step 4: Commit**

Run:
```bash
cd ~/github/new-blog
git add apps/blog/package.json apps/admin/package.json bun.lockb
git commit -m "chore(root): rename app packages to 'blog' and 'admin' for turbo --filter"
```

---

## Task 15: Verify Turborepo can see both workspaces

**Files:** (no file changes)

- [ ] **Step 1: List workspaces via turbo**

Run:
```bash
cd ~/github/new-blog && bunx turbo ls
```
Expected: lists `blog` and `admin` as workspaces. If Turbo output format differs, any command that shows both names is acceptable.

- [ ] **Step 2: Dry-run a build to see the task graph**

Run:
```bash
cd ~/github/new-blog && bunx turbo run build --dry-run=json | head -60
```
Expected: JSON output listing `blog#build` and `admin#build` as tasks.

No commit — this is verification only.

---

## Task 16: Verify lint works end-to-end

**Files:** (no changes unless lint fails)

- [ ] **Step 1: Run lint on blog**

Run:
```bash
cd ~/github/new-blog && bunx turbo run lint --filter=blog
```
Expected: PASS (pre-existing code was already linting clean in the source repo).

- [ ] **Step 2: Run lint on admin**

Run:
```bash
cd ~/github/new-blog && bunx turbo run lint --filter=admin
```
Expected: PASS.

- [ ] **Step 3: If lint fails**

If either fails due to the monorepo layout (not pre-existing code issues), STOP and report the error to the user. Do not silently fix lint errors — they may indicate a scaffolding problem.

---

## Task 17: Verify build works end-to-end

**Files:** (no changes)

- [ ] **Step 1: Build blog**

Run:
```bash
cd ~/github/new-blog && bunx turbo run build --filter=blog
```
Expected: PASS. `.next/` created in `apps/blog/`.

- [ ] **Step 2: Build admin**

Run:
```bash
cd ~/github/new-blog && bunx turbo run build --filter=admin
```
Expected: PASS. `.next/` in `apps/admin/`.

- [ ] **Step 3: Verify turbo cache populated**

Run:
```bash
ls ~/github/new-blog/.turbo 2>/dev/null && echo "turbo cache dir exists"
```
Expected: `.turbo` dir exists (may be empty or contain cache entries depending on turbo version).

- [ ] **Step 4: Re-build and confirm cache hit**

Run:
```bash
cd ~/github/new-blog && bunx turbo run build --filter=blog
```
Expected: "cache hit" / "FULL TURBO" / similar indicator showing it did NOT rebuild.

---

## Task 18: Touch up per-app CLAUDE.md files

**Files:**
- Modify: `~/github/new-blog/apps/blog/CLAUDE.md` (if it exists) or create
- Modify: `~/github/new-blog/apps/admin/CLAUDE.md` (if it exists) or create
- Modify: `~/github/new-blog/apps/api/CLAUDE.md` (if it exists) or create

Each should have a short header pointing to the root `CLAUDE.md` for cross-cutting rules.

- [ ] **Step 1: Check which CLAUDE.md files exist**

Run:
```bash
ls ~/github/new-blog/apps/blog/CLAUDE.md ~/github/new-blog/apps/admin/CLAUDE.md ~/github/new-blog/apps/api/CLAUDE.md 2>/dev/null
```
Expected: likely all three exist (copied from source repos). Note which ones do.

- [ ] **Step 2: Prepend monorepo header to each existing CLAUDE.md**

For each existing `apps/*/CLAUDE.md`, prepend this block at the very top (above whatever is there):

```markdown
> **Monorepo notice:** This file documents the `<appname>` app inside the `blog` monorepo.
> For cross-cutting rules (path discipline, commit conventions, git workflow), see the root [`CLAUDE.md`](../../CLAUDE.md).
> Run `git` commands from the monorepo root (`~/github/new-blog`), not from this folder.

---

```

Replace `<appname>` with `blog`, `admin`, or `api` as appropriate.

If a file does NOT exist, create it with just the header block plus a one-line description.

- [ ] **Step 3: Commit**

Run:
```bash
cd ~/github/new-blog
git add apps/blog/CLAUDE.md apps/admin/CLAUDE.md apps/api/CLAUDE.md
git commit -m "docs(root): add monorepo header to per-app CLAUDE.md files

Each app-level CLAUDE.md now points to the root CLAUDE.md for
path rules and commit conventions."
```

---

## Task 19: Final verification and log review

**Files:** (no changes)

- [ ] **Step 1: Inspect full git log**

Run:
```bash
git -C ~/github/new-blog log --oneline
```
Expected: roughly 6–8 commits, all with proper `type(scope):` prefixes:
```
docs(root): add monorepo header to per-app CLAUDE.md files
chore(root): rename app packages to 'blog' and 'admin' for turbo --filter  (optional)
chore(root): add bun.lockb after first install
chore(root): remove non-bun lockfiles from apps/blog and apps/admin        (optional)
feat(api): import giwon-blog-api source
feat(admin): import admin.giwon.dev source
feat(blog): import blog.giwon.dev source
chore(root): initialize blog monorepo scaffold
```

- [ ] **Step 2: Verify per-scope log filtering works**

Run:
```bash
git -C ~/github/new-blog log --oneline -- apps/blog/
git -C ~/github/new-blog log --oneline -- apps/admin/
git -C ~/github/new-blog log --oneline -- apps/api/
```
Expected: each shows only the commits touching that path. This confirms per-project history navigation works.

- [ ] **Step 3: Verify final directory layout**

Run:
```bash
ls ~/github/new-blog
ls ~/github/new-blog/apps
```
Expected: root has `.git`, `.gitignore`, `CLAUDE.md`, `apps/`, `bun.lockb`, `docs/`, `node_modules/`, `package.json`, `packages/`, `turbo.json`. `apps/` has `blog/`, `admin/`, `api/`.

- [ ] **Step 4: Run a clean dev smoke test on blog (optional, requires user)**

Run:
```bash
cd ~/github/new-blog && bunx turbo run dev --filter=blog
```
Expected: Next.js dev server starts on `:3000`. User opens browser to verify the page renders. Then Ctrl+C.

This step is OPTIONAL because it depends on backend API being up; if you can't verify the full page, just confirm the dev server *starts* without errors.

---

## Out of Scope (Future Plans)

- Rewriting `apps/api` from Kotlin/Spring Boot to Hono+Bun (separate plan, significant effort).
- Archiving the three source repos on GitHub and updating their READMEs with a "moved to monorepo" notice.
- Pushing the new `blog` monorepo to a new GitHub repo and setting up CI/CD.
- Creating `packages/shared-types` with common DTOs.
- Moving the old `~/github/blog/` directory aside or deleting it after the user confirms the monorepo works.

These will be handled in follow-up plans.
