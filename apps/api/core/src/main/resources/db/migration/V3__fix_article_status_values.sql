-- V3: Drop old check constraint and fix article status values

-- 1. Drop Hibernate-generated check constraint (it only allows old enum values)
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;

-- 2. Fix old status values
UPDATE articles SET status = 'PUBLIC' WHERE status = 'PUBLISHED';
UPDATE articles SET status = 'PRIVATE' WHERE status = 'HIDDEN';
UPDATE articles SET status = 'PUBLIC' WHERE status NOT IN ('DRAFT', 'PUBLIC', 'LOCKED', 'PRIVATE');

-- 3. Add new check constraint with correct values
ALTER TABLE articles ADD CONSTRAINT articles_status_check
    CHECK (status IN ('DRAFT', 'PUBLIC', 'LOCKED', 'PRIVATE'));
