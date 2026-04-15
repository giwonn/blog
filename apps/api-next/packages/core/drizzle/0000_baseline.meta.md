# 0000 Baseline — Runbook

This migration is **never actually executed against the production DB**. It exists so Drizzle can own the schema going forward from a known baseline equal to the Flyway-managed state.

> **Note on drizzle-kit MAXVALUE bug:** drizzle-kit 0.31.10 generates `MAXVALUE 9223372036854776000` for bigint identity sequences (float64 precision loss of `Long.MAX_VALUE = 9223372036854775807`). This SQL has been hand-patched in `0000_baseline.sql` to use the correct value `9223372036854775807`. This patch must be re-applied if the baseline is ever regenerated. See the concern note at the bottom of this file.

## Pre-insert (Plan K2, against production)

Before running `drizzle-kit migrate` for the first time on production, mark this migration as already applied so Drizzle does not try to re-create existing tables.

`__drizzle_migrations` lives in the `drizzle` schema (drizzle-kit creates this schema automatically). Create the schema and table if they do not exist, then insert:

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('7b3255d657ce5f687bddd7b68a0dfae797854ba8c2ac4c03fe6820560fcf0f68', 1776215094768);
```

## Verifying

After the pre-insert:

```bash
bunx drizzle-kit migrate
```

should print `migrations applied successfully!` (applying only subsequent migrations, if any) or `No migrations to run` once there are none pending.

## Rollback

To revert Drizzle's ownership of the baseline:

```sql
DELETE FROM drizzle.__drizzle_migrations
WHERE hash = '7b3255d657ce5f687bddd7b68a0dfae797854ba8c2ac4c03fe6820560fcf0f68';
```

Flyway is unaffected throughout this flow.

## Dry-run results (local, k1_baseline_dryrun DB)

- **Hash:** `7b3255d657ce5f687bddd7b68a0dfae797854ba8c2ac4c03fe6820560fcf0f68`
- **Created_at:** `1776215094768` (ms timestamp)
- **Tables created:** 11 (article_stats, articles, batch_job_log, books, daily_article_stats, daily_visitor_stats, flyway_schema_history, page_views, series, settings, visitor_sessions)
- **Migration runtime:** ~0.4s on a clean local DB
- **drizzle-kit version:** 0.31.10

## Concern: MAXVALUE float64 truncation (drizzle-kit bug)

drizzle-kit 0.31.10 serializes `Long.MAX_VALUE` (`9223372036854775807`) as `9223372036854776000` in generated SQL due to JavaScript float64 precision limits. This value is outside the valid bigint range and causes Postgres error `value "9223372036854776000" is out of range for type bigint`.

**Impact:** The 7 affected identity sequences (`article_stats`, `articles`, `batch_job_log`, `daily_article_stats`, `daily_visitor_stats`, `page_views`, `visitor_sessions`) had their MAXVALUE hand-corrected to `9223372036854775807` in `0000_baseline.sql`.

**K2 implication:** Because the SQL file was hand-edited after generation, the hash in `drizzle.__drizzle_migrations` was computed from the **edited** file. The pre-insert hash above (`7b3255d6...`) reflects the corrected SQL. Do NOT regenerate without re-applying this patch and re-capturing the hash via a fresh dry-run.
