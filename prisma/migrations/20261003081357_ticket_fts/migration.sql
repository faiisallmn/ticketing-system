-- Full-text search and typo-tolerant matching for tickets and comments.
-- Expression indexes only (no extra columns), so Prisma schema drift checks
-- stay clean.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- English full-text index over title + description.
CREATE INDEX IF NOT EXISTS tickets_fts_idx ON tickets
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Trigram index for partial words and typos on titles.
CREATE INDEX IF NOT EXISTS tickets_title_trgm_idx ON tickets
  USING GIN (title gin_trgm_ops);

-- Full-text index over comment bodies (replies are searchable too).
CREATE INDEX IF NOT EXISTS comments_fts_idx ON comments
  USING GIN (to_tsvector('english', coalesce(body, '')));
