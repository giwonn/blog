# API Rewrite — Plan K1: Parity Audit & Schema Ownership Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a behavioral-parity audit between Kotlin and Hono APIs, remediate any gaps found, and write (but do not execute) the DB migrations that transfer schema ownership to Drizzle and drop dead tables.

**Architecture:** Read-only audit over 14 Kotlin controllers vs the corresponding Hono route files, producing a markdown artifact. Then generate drizzle baseline + drop migrations locally against a fresh DB, documenting the exact pre-insert runbook Plan K2 will execute against production. Nothing ships to the running system.

**Tech Stack:** Grep / ripgrep for controller inspection, `drizzle-kit generate`, a disposable local Postgres for migration dry-runs.

**Design reference:** `docs/superpowers/specs/2026-04-14-api-rewrite-plan-k1-parity-schema-design.md`

---

## Scope Check

K1 is constrained to audit + migration-writing. No Dockerfile changes (K2), no production DB touching (K2), no code deletion (K3), no Jenkins reconfiguration (K3).

## File Structure

```
docs/superpowers/audits/
└── 2026-04-14-plan-k1-parity.md            # NEW: audit artifact

apps/api-next/packages/core/
├── src/
│   └── db/
│       └── schema.ts                       # MODIFY: remove article_stats, daily_article_stats
└── drizzle/                                # NEW directory
    ├── 0000_baseline.sql                   # generated
    ├── 0000_baseline.meta.md               # runbook for K2
    ├── 0001_drop_dead_tables.sql           # generated + edited if needed
    └── meta/
        └── _journal.json                   # drizzle-kit journal
```

---

## Task 1: Parity audit — blog (public) endpoints

**Files:**
- Create: `docs/superpowers/audits/2026-04-14-plan-k1-parity.md`

- [ ] **Step 1: Extract Kotlin blog endpoints**

```bash
cd ~/github/new-blog
for f in apps/api/api-blog/src/main/kotlin/com/giwon/blog/api/controller/*Controller.kt; do
  echo "=== $f ==="
  grep -nE "@(Get|Post|Put|Delete|Patch|Request)Mapping|@RequestParam|@PathVariable|@RequestBody|class .*Controller" "$f"
done > /tmp/kotlin-blog-endpoints.txt
wc -l /tmp/kotlin-blog-endpoints.txt
```

Read `/tmp/kotlin-blog-endpoints.txt` to understand each controller's surface. For every controller, record:
- Class-level `@RequestMapping` prefix (if any)
- Each method's HTTP verb + path + path vars + query params + request body DTO + return type (typically `ApiResponse<T>`)

- [ ] **Step 2: Extract Hono blog routes**

```bash
cd ~/github/new-blog
find apps/api-next/apps/blog/src/routes -name "*.ts" | sort
# For each route file, print exported handlers:
for f in apps/api-next/apps/blog/src/routes/*.ts; do
  echo "=== $f ==="
done
```

Read each route file. Record the method, path, c.req schema usage, response shape. Cross-reference `apps/api-next/apps/blog/src/app.ts` for how each route is mounted (the base path matters).

- [ ] **Step 3: Write audit tables**

Create `docs/superpowers/audits/2026-04-14-plan-k1-parity.md` with this header and the blog section filled in:

```markdown
# Plan K1 Parity Audit — Kotlin vs Hono/Bun

**Generated:** 2026-04-14
**Kotlin source:** `apps/api/api-blog/**/*Controller.kt`, `apps/api/api-admin/**/*Controller.kt`
**Hono source:** `apps/api-next/apps/{blog,admin}/src/routes/**/*.ts`

Legend: ✅ identical · ⚠ minor semantic diff (still behaviorally compatible) · ❌ missing or broken

---

## Blog (public)

### Health — HealthController
| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| GET | /health | /health | — | — | `{status:"ok"}` envelope | ✅ |

### Books — BookController
| Method | Kotlin path | Hono path | Params | Request | Response | Status |
|--------|-------------|-----------|--------|---------|----------|--------|
| ... fill in from actual controller inspection ... |

### Series — SeriesController
... same ...

### Articles — ArticleController
... same ...

### Sidebar — SidebarController
... same ...

### Analytics track — AnalyticsTrackController
... same ...

**Blog gaps:** (list or "none")
```

Fill every row by actually reading the controllers and comparing. Do NOT make up entries — read the files. Where a Kotlin-specific thing doesn't have a direct equivalent (e.g. `@RequestMapping` prefix is structural, not behavioral), ignore it as long as the effective path matches.

- [ ] **Step 4: Commit the blog half**

```bash
cd ~/github/new-blog
git add docs/superpowers/audits/2026-04-14-plan-k1-parity.md
git commit -m "docs(root): add parity audit (blog section) for Plan K1

Tables for health, books, series, articles, sidebar, analytics
track. Blog gaps listed at the end of the section."
```

---

## Task 2: Parity audit — admin endpoints

**Files:**
- Modify: `docs/superpowers/audits/2026-04-14-plan-k1-parity.md`

- [ ] **Step 1: Extract Kotlin admin endpoints**

```bash
cd ~/github/new-blog
for f in apps/api/api-admin/src/main/kotlin/com/giwon/blog/admin/controller/*Controller.kt; do
  echo "=== $f ==="
  grep -nE "@(Get|Post|Put|Delete|Patch|Request)Mapping|@RequestParam|@PathVariable|@RequestBody|class .*Controller" "$f"
done > /tmp/kotlin-admin-endpoints.txt
```

Read the file. For each of the 8 admin controllers (Analytics, Health, Dashboard, Settings, BookAdmin, ArticleAdmin, SeriesAdmin, ImageAdmin), extract the same shape as Task 1.

- [ ] **Step 2: Extract Hono admin routes**

```bash
find apps/api-next/apps/admin/src/routes -name "*.ts" | sort
```

Read each. Cross-reference `apps/api-next/apps/admin/src/app.ts` for mount paths (all prefixed `/admin/*`).

- [ ] **Step 3: Append admin tables to the audit doc**

Append a new top-level section after the blog section:

```markdown
---

## Admin (authenticated)

### Health — HealthController
... ✅ ...

### Settings — SettingsController
... ...

### Dashboard — DashboardController
... ...

### Books — BookAdminController
... ...

### Articles — ArticleAdminController
... ...

### Series — SeriesAdminController
... ...

### Analytics — AnalyticsController
... ...

### Image — ImageAdminController
... ...

**Admin gaps:** (list or "none")

---

## Final gap summary
**Total gaps found:** N

1. ...
2. ...
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/audits/2026-04-14-plan-k1-parity.md
git commit -m "docs(root): add parity audit (admin section + final summary)

Tables for health, settings, dashboard, books, articles, series,
analytics, image. Total gap count recorded."
```

- [ ] **Step 5: Stop and report**

After committing, pause and report to the user:
- Total gap count
- If gaps > 0, list each one briefly
- If gaps > 3, STOP — K1 spec says we re-review

The user decides whether to proceed to Task 3 (gap fixes) or skip it if zero gaps.

---

## Task 3: Gap remediation (speculative — skip if zero gaps)

**Files:** (depends on which gaps surface)

**Execution rule:** This task is a placeholder for up to 3 gap-fix sub-tasks. Each sub-task follows TDD red/green:

- [ ] For each gap:
  1. Write a failing test in the relevant `test/` file that asserts the Kotlin behavior
  2. Run the test: expect red
  3. Patch the Hono route or service
  4. Run the test: expect green
  5. Run the full affected workspace test suite
  6. Commit with a scope-appropriate conventional commit (`fix(api-admin): ...`, `fix(core): ...`, etc.)

- [ ] After all gap fixes, update the audit doc: change ❌ → ✅ with a note pointing to the fix commit SHA. Commit the doc update.

**If zero gaps:** Skip this entire task and proceed to Task 4.

**If more than 3 gaps:** STOP. Do not proceed. Re-review the spec with the user — the cutover readiness assumption may have been wrong.

---

## Task 4: Drizzle baseline migration

**Files:**
- Create: `apps/api-next/packages/core/drizzle/0000_baseline.sql` (generated)
- Create: `apps/api-next/packages/core/drizzle/0000_baseline.meta.md` (runbook)
- Create: `apps/api-next/packages/core/drizzle/meta/_journal.json` (generated)
- Possibly modify: `apps/api-next/packages/core/drizzle.config.ts` if it doesn't exist yet

- [ ] **Step 1: Confirm/create `drizzle.config.ts`**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
ls drizzle.config.ts 2>/dev/null || echo "MISSING"
```

If missing, create `apps/api-next/packages/core/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://api_next:api_next_dev_pwd@localhost:5433/api_next_dev",
  },
});
```

If it already exists and points somewhere else, adjust carefully — ideally it already points at `./drizzle`. If it points at a legacy location, rename the legacy dir first (unlikely for this repo since no prior migrations exist).

- [ ] **Step 2: Generate baseline migration**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog/apps/api-next/packages/core
bunx drizzle-kit generate --name baseline
```

This writes `drizzle/0000_baseline.sql` and updates `drizzle/meta/_journal.json`. Inspect the SQL:

```bash
wc -l drizzle/0000_baseline.sql
head -40 drizzle/0000_baseline.sql
```

Expected: `CREATE TABLE` statements for every current table (articles, books, series, settings, page_views, visitor_sessions, daily_visitor_stats, article_stats, daily_article_stats, comments if any, image tables if any). Plus indexes and FKs.

If drizzle-kit emits something surprising (e.g. renames, column changes), STOP and report — something is inconsistent with the introspected schema.

- [ ] **Step 3: Dry-run against a fresh local DB**

Spin up a clean, throwaway DB and verify the migration applies:

```bash
# Start the dev DB if not running
cd ~/github/new-blog/apps/api-next
docker compose up -d postgres
# Create a throwaway database
docker exec api-next-dev-db psql -U api_next -c "DROP DATABASE IF EXISTS k1_baseline_dryrun;"
docker exec api-next-dev-db psql -U api_next -c "CREATE DATABASE k1_baseline_dryrun;"
# Run drizzle migrate against it
cd packages/core
DATABASE_URL="postgresql://api_next:api_next_dev_pwd@localhost:5433/k1_baseline_dryrun" \
  bunx drizzle-kit migrate
# Inspect the __drizzle_migrations table to capture the hash
docker exec api-next-dev-db psql -U api_next -d k1_baseline_dryrun -c \
  "SELECT hash, created_at FROM __drizzle_migrations;"
# Verify tables exist
docker exec api-next-dev-db psql -U api_next -d k1_baseline_dryrun -c "\dt"
```

**Capture the hash value** — it goes into the runbook.

Then drop the dry-run DB:
```bash
docker exec api-next-dev-db psql -U api_next -c "DROP DATABASE k1_baseline_dryrun;"
```

- [ ] **Step 4: Write `0000_baseline.meta.md` runbook**

Create `apps/api-next/packages/core/drizzle/0000_baseline.meta.md`:

```markdown
# 0000 Baseline — Runbook

This migration is **never actually executed against the production DB**. It exists so Drizzle can own the schema going forward from a known baseline equal to the Flyway-managed state.

## Pre-insert (Plan K2, against production)

Before running `drizzle-kit migrate` for the first time on production, mark this migration as already applied so Drizzle does not try to re-create existing tables:

\`\`\`sql
INSERT INTO __drizzle_migrations (hash, created_at)
VALUES ('<HASH_FROM_DRY_RUN>', <MS_FROM_DRY_RUN>);
\`\`\`

If the `__drizzle_migrations` table does not exist yet on production, create it first:

\`\`\`sql
CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
\`\`\`

## Verifying

After the pre-insert:

\`\`\`bash
bunx drizzle-kit migrate
\`\`\`

should print "No migrations to run" or only apply subsequent migrations (e.g. 0001_drop_dead_tables).

## Rollback

To revert Drizzle's ownership of the baseline:

\`\`\`sql
DELETE FROM __drizzle_migrations WHERE hash = '<HASH_FROM_DRY_RUN>';
\`\`\`

Flyway is unaffected throughout this flow.

## Dry-run results (local, k1_baseline_dryrun DB)

- Hash: `<ACTUAL_HASH>`
- Created_at: `<ACTUAL_MS>`
- Tables created: `<count>` (matches `\dt` output from introspected schema)
- Takes ~<seconds>s on a clean DB
```

Replace `<HASH_FROM_DRY_RUN>`, `<MS_FROM_DRY_RUN>`, etc. with the values captured in Step 3.

- [ ] **Step 5: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/drizzle/0000_baseline.sql apps/api-next/packages/core/drizzle/0000_baseline.meta.md apps/api-next/packages/core/drizzle/meta/_journal.json apps/api-next/packages/core/drizzle.config.ts
git commit -m "feat(core): add drizzle baseline migration + K2 runbook

0000_baseline.sql is the introspected schema as drizzle SQL. It
is never executed — the K2 runbook pre-inserts its hash into
__drizzle_migrations so drizzle-kit treats it as already-applied.
Dry-run hash and tables confirmed against a throwaway local DB."
```

(Include `drizzle.config.ts` in the commit only if you created it. If it already existed, omit.)

---

## Task 5: Dead table drop migration

**Files:**
- Modify: `apps/api-next/packages/core/src/db/schema.ts`
- Create: `apps/api-next/packages/core/drizzle/0001_drop_dead_tables.sql`

- [ ] **Step 1: Verify dead tables are truly unreferenced**

```bash
cd ~/github/new-blog
# Kotlin side
grep -rn "article_stats\|daily_article_stats" apps/api/ 2>&1 | head -20
# Hono side (should find only schema.ts references)
grep -rn "article_stats\|daily_article_stats\|articleStats\|dailyArticleStats" apps/api-next/ 2>&1 | head -20
```

Expected: Kotlin has entity classes / jpa repositories for both but no active call sites (they were reader-only in Plan F/G investigations). Hono-side should find only `schema.ts`.

If Hono has any reference outside `schema.ts`, STOP and report. Don't drop a table that something is reading.

- [ ] **Step 2: Remove dead tables from `schema.ts`**

Read `apps/api-next/packages/core/src/db/schema.ts`, locate the `article_stats` and `daily_article_stats` (or `articleStats` / `dailyArticleStats`) exports, delete those blocks. Save.

- [ ] **Step 3: Generate the drop migration**

```bash
cd ~/github/new-blog/apps/api-next/packages/core
bunx drizzle-kit generate --name drop_dead_tables
```

drizzle-kit should detect the schema diff and emit `0001_drop_dead_tables.sql` with `DROP TABLE "article_stats";` and `DROP TABLE "daily_article_stats";`.

Inspect:

```bash
cat drizzle/0001_drop_dead_tables.sql
```

If it emits `CASCADE` or `IF EXISTS`, that's fine. If it tries to drop columns instead of whole tables, STOP — that means the schema.ts edit was incomplete.

- [ ] **Step 4: Dry-run against a fresh local DB with tables seeded**

```bash
# Reset the dev DB and let Flyway (from the Kotlin app, if you have the gradle setup running) repopulate it,
# OR use pg_restore from a recent Flyway-produced dump.
# The simplest dry-run: spin up a Kotlin-like schema via a minimal seed SQL that creates article_stats + daily_article_stats.

docker exec api-next-dev-db psql -U api_next -c "DROP DATABASE IF EXISTS k1_drop_dryrun;"
docker exec api-next-dev-db psql -U api_next -c "CREATE DATABASE k1_drop_dryrun;"
# Apply baseline first (creates all tables including the dead ones, since the baseline was generated BEFORE removing them from schema.ts)

# WAIT — this requires rolling back the schema.ts edit temporarily. Simpler: spin up a local DB,
# manually create just the two dead tables, then apply the drop migration.
docker exec api-next-dev-db psql -U api_next -d k1_drop_dryrun -c "
  CREATE TABLE article_stats (id SERIAL PRIMARY KEY);
  CREATE TABLE daily_article_stats (id SERIAL PRIMARY KEY);
"
# Fake the __drizzle_migrations so migrate only applies 0001
docker exec api-next-dev-db psql -U api_next -d k1_drop_dryrun -c "
  CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
  INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('<BASELINE_HASH_FROM_TASK_4>', 0);
"
DATABASE_URL="postgresql://api_next:api_next_dev_pwd@localhost:5433/k1_drop_dryrun" \
  bunx drizzle-kit migrate
# Confirm tables are gone
docker exec api-next-dev-db psql -U api_next -d k1_drop_dryrun -c "\dt"
# Expected: no article_stats, no daily_article_stats
# Cleanup
docker exec api-next-dev-db psql -U api_next -c "DROP DATABASE k1_drop_dryrun;"
```

- [ ] **Step 5: Run full test suite to confirm the schema.ts edit didn't break anything**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bun run test 2>&1 | tail -30
bunx turbo run lint 2>&1 | tail -10
```
Expected: 4/4 tests, 5/5 lint, same counts as after Plan J.

If anything breaks, it means something was referencing the dead tables via schema.ts. Fix by either putting the reference back behind a migration or removing the reference too.

- [ ] **Step 6: Commit**

```bash
cd ~/github/new-blog
git add apps/api-next/packages/core/src/db/schema.ts apps/api-next/packages/core/drizzle/0001_drop_dead_tables.sql apps/api-next/packages/core/drizzle/meta/_journal.json
git commit -m "feat(core): add drop migration for dead analytics tables

article_stats and daily_article_stats were never read by any
current code (confirmed by grep of both Kotlin and Hono sides
during Plan G2 investigation). Drop them cleanly via drizzle-kit.
Applied via K2 runbook against production; dry-run verified."
```

---

## Task 6: Final K1 verification + audit close-out

**Files:**
- Modify: `docs/superpowers/audits/2026-04-14-plan-k1-parity.md` (close-out note)

- [ ] **Step 1: Full monorepo lint + test**

```bash
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$PATH"
cd ~/github/new-blog
bunx turbo run lint --force 2>&1 | tail -10
bun run test 2>&1 | tail -20
```
Expected: 5/5 lint, 4/4 test.

- [ ] **Step 2: Append close-out to audit doc**

Add a final section at the bottom of `docs/superpowers/audits/2026-04-14-plan-k1-parity.md`:

```markdown
---

## K1 Close-out

- **Audit completed:** <date>
- **Gaps found:** <N>
- **Gaps fixed:** <N>  (commits: <SHA list, or "none">)
- **Baseline migration:** `0000_baseline.sql` + runbook committed (<SHA>)
- **Dead table drop migration:** `0001_drop_dead_tables.sql` committed (<SHA>)
- **Tests:** 4/4 workspaces, <N> total tests pass
- **Lint:** 5/5 clean
- **Go/no-go for K2:** GO ✅
```

- [ ] **Step 3: Commit**

```bash
cd ~/github/new-blog
git add docs/superpowers/audits/2026-04-14-plan-k1-parity.md
git commit -m "docs(root): close out Plan K1 parity audit

Final gap count, migration SHAs, and go/no-go decision for K2."
```

- [ ] **Step 4: Report summary to the user**

Report:
- Total gaps found and fixed
- Baseline migration hash
- Dead-table-drop SHAs
- Test counts
- Go/no-go recommendation for K2
- Any surprises worth flagging before starting K2

---

## Plan K1 Completion Checklist

- [ ] Task 1: blog parity audit section committed
- [ ] Task 2: admin parity audit section + final gap summary committed
- [ ] Task 3: zero to three gap-fix commits (or skipped if zero gaps)
- [ ] Task 4: `0000_baseline.sql` + `.meta.md` runbook committed, hash captured from dry-run
- [ ] Task 5: `schema.ts` edited, `0001_drop_dead_tables.sql` committed, dry-run verified
- [ ] Task 6: audit close-out committed, lint 5/5, test 4/4

## Out of Scope

- Dockerfile / compose / nginx changes — **Plan K2**
- Running baseline or drop migrations against production — **Plan K2**
- Actual blue-green container cutover — **Plan K2**
- Jenkins reconfiguration — **Plan K3**
- `apps/api/` deletion — **Plan K3**
- Old frontend repo archival — **Plan K3**
- Root CLAUDE.md / turbo.json / package.json cleanup — **Plan K3**
