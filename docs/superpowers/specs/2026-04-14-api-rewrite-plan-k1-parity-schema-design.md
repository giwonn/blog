# API Rewrite — Plan K1: Parity Audit & Schema Ownership Design

**Date:** 2026-04-14
**Status:** Approved for planning
**Parent:** `docs/superpowers/specs/2026-04-13-api-rewrite-design.md`
**Depends on:** Plans A-J (domains complete)
**Feeds:** Plan K2 (cutover), Plan K3 (cleanup)

## Goal

Prepare for cutover by proving the new Hono/Bun API has full behavioral parity with the Kotlin API, and by writing (not yet executing) the DB migrations that transfer schema ownership from Flyway to Drizzle and drop dead tables. Plan K1 ships code and a baseline audit artifact only — no deployment, no code deletion, fully reversible.

## Non-Goals

- Dockerfile / nginx / compose changes (Plan K2)
- Actual cutover or container orchestration (Plan K2)
- Running the baseline or drop migrations against any live DB (Plan K2)
- Deleting `apps/api/` (Plan K3)
- Jenkins / CI reconfiguration (Plan K3)
- Frontend changes

## Work Breakdown

### 1. Parity Audit

**Inputs:**
- 6 Kotlin blog controllers: `HealthController`, `BookController`, `SidebarController`, `ArticleController`, `AnalyticsTrackController`, `SeriesController`
- 8 Kotlin admin controllers: `AnalyticsController`, `HealthController`, `DashboardController`, `SettingsController`, `BookAdminController`, `ArticleAdminController`, `SeriesAdminController`, `ImageAdminController`
- Plan B–J implementations in `apps/api-next/apps/{blog,admin}/src/routes/`

**Method:**
For each Kotlin controller:
1. Grep `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`, `@RequestMapping` to extract `(method, path)` tuples, including class-level prefixes.
2. Record request params: path vars, query params, request body shape, required vs optional.
3. Record response shape including `ApiResponse<T>` envelope.
4. Locate the matching Hono route file in `apps/api-next/apps/{blog,admin}/src/routes/`.
5. Diff: HTTP method + path, query params, body shape, response shape, auth requirement, status codes on error paths.

**Output artifact:**
`docs/superpowers/audits/2026-04-14-plan-k1-parity.md` with one table per domain:

```
## Articles (blog public)

| Method | Kotlin path | Hono path | Params | Request | Response | Diff |
|--------|-------------|-----------|--------|---------|----------|------|
| GET | /articles | /articles | ?page&size&status&... | — | Page<Article> | ✅ same |
| GET | /articles/{slug} | /articles/:slug | slug, ?password | — | Article | ✅ same |
| ...  | ...         | ...       | ...    | ...     | ...      | ...  |

**Gaps:** none found
```

Markdown, one section per domain (blog + admin). Each row with ✅ (identical), ⚠ (minor semantic diff that still matches behavior), or ❌ (missing/broken). The bottom "Gaps" list drives remediation tasks.

**Expected outcome:** 0-3 gaps. Plans B–J were thorough, but edge cases like a rarely-used query param filter or an unusual error status are possible. The audit is worth doing even if it turns up nothing — the artifact is a go/no-go signal for K2.

### 2. Gap Remediation

Only executed if the audit finds gaps. Each gap becomes a sub-task that follows TDD red/green:
1. Write a failing test reproducing the Kotlin behavior
2. Patch the Hono route or service
3. Make test green
4. Commit

Plan K1 reserves up to 3 gap-fix tasks as speculative slots. If zero gaps, these tasks are skipped entirely. If more than 3 gaps, K1 stops and the audit is reviewed — possibly we split into K1a (fix gaps) before proceeding.

### 3. Drizzle Baseline Migration

Current state: `drizzle-kit` introspected the Flyway-managed schema into `apps/api-next/packages/core/src/db/schema.ts`. No drizzle migrations exist yet; the schema is frozen/read-only.

**Procedure:**
1. Run `drizzle-kit generate --name baseline` against the current schema. This emits `apps/api-next/packages/core/drizzle/0000_baseline.sql` containing `CREATE TABLE IF NOT EXISTS ...` for every introspected table plus indexes, constraints, FKs. Because the schema matches reality, this migration is a no-op if "marked as applied" first.
2. Create a second file `apps/api-next/packages/core/drizzle/0000_baseline.meta.md` documenting:
   - When to run (never against a populated Flyway DB without the pre-insert)
   - The pre-insert SQL: `INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('<hash>', <ms>);` — the hash is read from `_meta/0000_snapshot.json` or computed the same way drizzle-kit does. Document the exact SQL so K2's cutover runbook can execute it manually before the first `drizzle-kit migrate`.
   - Rollback: `DELETE FROM __drizzle_migrations WHERE hash = '<hash>';`
3. Verify locally: spin up a fresh Postgres (docker compose has `api-next-dev-db`), run Flyway against it to match production, then run the pre-insert + `drizzle-kit migrate`. Result: `__drizzle_migrations` has one row, no DDL executed, schema unchanged. Document this in the .meta.md.
4. Leave `flyway_schema_history` alone. It stays in the DB until Plan K3 (optional manual drop).

### 4. Dead Table Drop Migration

Target tables (confirmed dead during Plans F/G/G2):
- `article_stats` — never read by any current code
- `daily_article_stats` — aggregator was abandoned; nothing reads it

**Keep (still live):**
- `daily_visitor_stats` — used by Plan G2 `getVisitorSummary`
- All domain tables

**Procedure:**
1. Add a new drizzle migration `0001_drop_dead_tables.sql` via `drizzle-kit generate`. Edit the generated file if drizzle-kit doesn't auto-detect the drop (it will only if the schema.ts has the tables removed — so step 0 is to delete the dead tables from `schema.ts` first, then generate).
2. Content: `DROP TABLE IF EXISTS article_stats; DROP TABLE IF EXISTS daily_article_stats;`
3. Dry-run against the local dev DB to confirm syntax.
4. Do NOT run against production — that's K2.
5. Also update `schema.ts` to remove those table definitions (they're dead, no code references them).

### 5. Verification

Plan K1 does not deploy anything, but the whole repo must still pass CI:
- `bunx turbo run lint` 5/5 (0 errors)
- `bun run test` 4/4 (all four test workspaces green — same counts as after Plan J, unless a gap remediation added tests)
- `drizzle-kit migrate` against a fresh local DB (clean slate, no Flyway involvement) successfully applies baseline + drop in sequence → sanity check the migrations don't break each other
- Audit artifact committed

## File Structure

```
docs/superpowers/
├── specs/
│   └── 2026-04-14-api-rewrite-plan-k1-parity-schema-design.md  # THIS FILE
├── plans/
│   └── 2026-04-14-api-rewrite-plan-k1-parity-schema.md          # next step
└── audits/
    └── 2026-04-14-plan-k1-parity.md                             # audit artifact

apps/api-next/packages/core/
├── src/
│   └── db/
│       └── schema.ts            # MODIFY: remove article_stats, daily_article_stats
└── drizzle/                     # NEW (first drizzle migrations directory)
    ├── 0000_baseline.sql        # generated, then verified
    ├── 0000_baseline.meta.md    # runbook for K2: pre-insert + rollback
    ├── 0001_drop_dead_tables.sql
    └── meta/
        └── _journal.json        # drizzle-kit's internal journal
```

## Risks & Mitigations

- **Audit misses a behavioral gap** (response shape subtly differs): Plans B–J already went through TDD with Kotlin reference. Audit is a second pass. If a gap ships to production, rollback via nginx flip (K2 concern).
- **drizzle-kit generates incompatible DDL** (e.g., drops constraints the live DB has extras of): K1 verifies against a fresh DB. K2 is when it meets reality. Mitigation: the baseline migration is never actually executed as DDL — the pre-insert skips it. So incompatibility is latent and doesn't bite.
- **Hash format for pre-insert**: drizzle-kit's hash algorithm might differ across versions. Mitigation: K1 runs `drizzle-kit migrate` against a fresh DB and reads the resulting `__drizzle_migrations` row to capture the exact hash. Document the observed value in `.meta.md`.

## Plan K1 Deliverables

1. `docs/superpowers/audits/2026-04-14-plan-k1-parity.md` — full audit table per domain, gaps list
2. 0-3 gap-fix commits (TDD, only if audit finds gaps)
3. `apps/api-next/packages/core/drizzle/0000_baseline.sql` + `.meta.md` runbook
4. `apps/api-next/packages/core/drizzle/0001_drop_dead_tables.sql`
5. `apps/api-next/packages/core/src/db/schema.ts` — dead tables removed
6. `bunx turbo run lint` 5/5 after everything
7. `bun run test` 4/4 after everything
8. Local drizzle-kit migrate dry-run result documented in `.meta.md`
9. No deployment, no `apps/api/` deletion, no Jenkins changes
