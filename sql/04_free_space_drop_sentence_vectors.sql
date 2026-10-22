-- Free up database space by removing the SENTENCE-level vectors.
-- Semantic search now uses talk_chunks, so these vectors are no longer needed.
-- The sentence TEXT stays (keyword search and RAG's full-talk text still use it).
--
-- Your embeddings are still saved on disk in scripts/output/sentences_with_embeddings.json
-- if you ever want them back.

-- 0. (Optional) See what is using space, before and after:
select relname as table_name,
       pg_size_pretty(pg_total_relation_size(oid)) as total_size
from pg_class
where relkind = 'r' and relnamespace = 'public'::regnamespace
order by pg_total_relation_size(oid) desc;

-- 1. Remove the old sentence-based search functions (they use the column we're dropping)
drop function if exists match_talks_sentences(vector, int, int);
drop function if exists match_sentences(vector, int);

-- 2. Drop the vector column. This also drops its IVFFlat index automatically.
alter table sentence_embeddings drop column if exists embedding;

-- 3. Run this LAST, by itself (VACUUM can't run together with other statements).
--    It rewrites the table so the space is actually given back.
-- vacuum full sentence_embeddings;
