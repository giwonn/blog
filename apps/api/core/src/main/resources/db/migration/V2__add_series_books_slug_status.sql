-- V2: Add series, books tables and article slug/status columns

-- 1. Create series table
CREATE TABLE IF NOT EXISTS series (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    thumbnail_url VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- 2. Create books table
CREATE TABLE IF NOT EXISTS books (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    author VARCHAR(255) NOT NULL,
    publisher VARCHAR(255),
    thumbnail_url VARCHAR(255),
    description TEXT,
    isbn VARCHAR(255),
    read_start_date DATE,
    read_end_date DATE,
    rating INTEGER,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- 3. Add new columns to articles (all nullable initially for data migration)
-- Using DO block for idempotency (IF NOT EXISTS for columns)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'slug') THEN
        ALTER TABLE articles ADD COLUMN slug VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'status') THEN
        ALTER TABLE articles ADD COLUMN status VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'series_id') THEN
        ALTER TABLE articles ADD COLUMN series_id BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'order_in_series') THEN
        ALTER TABLE articles ADD COLUMN order_in_series INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'book_id') THEN
        ALTER TABLE articles ADD COLUMN book_id BIGINT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'articles' AND column_name = 'order_in_book') THEN
        ALTER TABLE articles ADD COLUMN order_in_book INTEGER;
    END IF;
END $$;

-- 4. Data migration: populate slug from id
UPDATE articles SET slug = CAST(id AS VARCHAR) WHERE slug IS NULL;

-- 5. Data migration: populate status from hidden/publishedAt/password
UPDATE articles SET status = 'LOCKED' WHERE password IS NOT NULL AND status IS NULL;
UPDATE articles SET status = 'PRIVATE' WHERE hidden = true AND status IS NULL;
UPDATE articles SET status = 'PUBLIC' WHERE status IS NULL AND published_at IS NOT NULL AND published_at <= NOW();
UPDATE articles SET status = 'DRAFT' WHERE status IS NULL;

-- 6. Add NOT NULL constraints after data migration
ALTER TABLE articles ALTER COLUMN slug SET NOT NULL;
ALTER TABLE articles ALTER COLUMN status SET NOT NULL;

-- 7. Add unique constraint on slug (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'articles_slug_unique') THEN
        ALTER TABLE articles ADD CONSTRAINT articles_slug_unique UNIQUE (slug);
    END IF;
END $$;

-- 8. Make published_at nullable
ALTER TABLE articles ALTER COLUMN published_at DROP NOT NULL;

-- 9. Drop the old hidden column
ALTER TABLE articles DROP COLUMN IF EXISTS hidden;
