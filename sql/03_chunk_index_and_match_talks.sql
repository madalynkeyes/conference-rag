-- Step 2b: run in Supabase Dashboard -> SQL Editor AFTER 06_build_chunks.py finishes.

-- 1. Vector index on the chunks (small table, so this builds quickly).
--    lists = 10 -> roughly 500 chunks per group.
set max_parallel_maintenance_workers = 0;
set maintenance_work_mem = '64MB';

create index if not exists talk_chunks_embedding_idx
on talk_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 10);

analyze talk_chunks;

-- 2. Keep the sentence version around (for comparison / rollback):
--    to go back later, drop match_talks and rename this one back.
alter function match_talks(vector, int, int) rename to match_talks_sentences;

-- 3. New match_talks: same inputs and outputs as before (so app.js needs NO changes),
--    but it searches paragraph chunks instead of single sentences.
--    Scoring is unchanged: best match + 0.01 per extra matching chunk (max +0.05).
create or replace function match_talks(
  query_embedding vector(1536),
  match_count int default 10,
  candidate_count int default 200
)
returns table (
  talk_id uuid,
  title text,
  speaker text,
  year int,
  season text,
  url text,
  score float,
  best_similarity float,
  matching_sentences int,   -- now = matching chunks (name kept so app.js still works)
  top_sentences text[]      -- now = the 2 best passages
)
language sql stable
as $$
  with candidates as (
    select
      c.talk_id, c.title, c.speaker, c.year, c.season, c.url, c.text,
      1 - (c.embedding <=> query_embedding) as similarity
    from talk_chunks c
    where c.embedding is not null
    order by c.embedding <=> query_embedding
    limit candidate_count
  ),
  ranked as (
    select cand.*,
      row_number() over (partition by cand.talk_id order by cand.similarity desc) as rn
    from candidates cand
  )
  select
    r.talk_id,
    min(r.title),
    min(r.speaker),
    min(r.year),
    min(r.season),
    min(r.url),
    max(r.similarity) + 0.01 * least(count(*) - 1, 5) as score,
    max(r.similarity),
    count(*)::int,
    -- passages can be long: trim each preview to ~300 characters
    array_agg(
      case when length(r.text) > 300 then left(r.text, 300) || '…' else r.text end
      order by r.similarity desc
    ) filter (where r.rn <= 2)
  from ranked r
  group by r.talk_id
  order by score desc
  limit match_count;
$$;
