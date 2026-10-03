-- Trigram matching is case-sensitive, but titles are mixed case: index the
-- lowered title so fuzzy search can use it.
DROP INDEX IF EXISTS tickets_title_trgm_idx;
CREATE INDEX IF NOT EXISTS tickets_title_trgm_idx ON tickets USING GIN (lower(title) gin_trgm_ops);
