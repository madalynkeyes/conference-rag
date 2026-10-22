-- Hybrid search: semantic (meaning) + full-text keyword search, merged with RRF.
-- Run in Supabase Dashboard -> SQL Editor. No re-embedding needed.

-- Adding a stored column rewrites talk_chunks and rebuilds its vector index,
-- which needs more than the free tier's default 32 MB of build memory.
set max_parallel_maintenance_workers = 0;
set maintenance_work_mem = '64MB';

-- 1. A full-text search column on the chunks.
--    Weights: title (A) > speaker and date (B) > passage text (C),
--    so a word in the title counts more than the same word deep in a passage.
alter table talk_chunks
add column if not exists fts tsvector
generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(speaker, '') || ' ' ||
                                   coalesce(season, '') || ' ' || coalesce(year::text, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(text, '')), 'C')
) stored;

-- 2. A GIN index makes keyword lookups fast.
create index if not exists talk_chunks_fts_idx on talk_chunks using gin (fts);

-- 3. The hybrid search function.
create or replace function hybrid_match_talks(
  query_text text,
  query_embedding vector(1536),
  match_count int default 10,
  candidate_count int default 200,
  rrf_k int default 60
)
returns table (
  talk_id uuid,
  title text,
  speaker text,
  year int,
  season text,
  url text,
  score float,               -- RRF score (used for ranking)
  best_similarity float,     -- shown as the % badge
  matching_sentences int,    -- matching chunks (name kept so app.js still works)
  top_sentences text[],      -- 2 best passages (keyword matches first)
  semantic_rank int,         -- this talk's rank in the semantic list (null = not found)
  keyword_rank int           -- this talk's rank in the keyword list (null = not found)
)
language sql stable
as $$
  with
  -- Keyword query: drop "search box" words that describe the request rather than
  -- the content (e.g. "Talks that discuss ..."). websearch_to_tsquery then requires
  -- ALL remaining meaningful words, supports "quoted phrases", and ignores filler words.
  kw as (
    select websearch_to_tsquery(
      'english',
      regexp_replace(query_text,
        '\m(talks?|discuss(es|ed)?|mention(s|ed)?|teach(es)?|taught|say(s)?|said)\M',
        ' ', 'gi')
    ) as q
  ),

  -- A. Semantic list: closest chunks by meaning
  sem_chunks as (
    select c.id, c.talk_id, 1 - (c.embedding <=> query_embedding) as similarity
    from talk_chunks c
    where c.embedding is not null
    order by c.embedding <=> query_embedding
    limit candidate_count
  ),
  -- Rank talks the same way match_talks does: best chunk + 0.01 per extra chunk (max +0.05)
  sem_talks as (
    select s.talk_id,
      row_number() over (
        order by max(s.similarity) + 0.01 * least(count(*) - 1, 5) desc
      ) as rnk
    from sem_chunks s
    group by s.talk_id
  ),

  -- B. Keyword list: chunks containing the words, ranked by ts_rank_cd
  --    (how often and how close together the words appear, weighted by A/B/C)
  kw_chunks as (
    select c.id, c.talk_id, ts_rank_cd(c.fts, kw.q) as kw_score
    from talk_chunks c, kw
    where c.fts @@ kw.q
    order by kw_score desc
    limit candidate_count
  ),
  kw_talks as (
    select k.talk_id,
      row_number() over (order by max(k.kw_score) desc, count(*) desc) as rnk
    from kw_chunks k
    group by k.talk_id
  ),

  -- C. Reciprocal Rank Fusion: 1/(k + rank) from each list, added together
  fused as (
    select
      coalesce(s.talk_id, k.talk_id) as talk_id,
      coalesce(1.0 / (rrf_k + s.rnk), 0) + coalesce(1.0 / (rrf_k + k.rnk), 0) as rrf,
      s.rnk::int as semantic_rank,
      k.rnk::int as keyword_rank
    from sem_talks s
    full outer join kw_talks k on k.talk_id = s.talk_id
    order by rrf desc
    limit match_count
  ),

  -- D. Passages for each winning talk (from either list)
  passages as (
    select c.talk_id, c.title, c.speaker, c.year, c.season, c.url, c.text,
      1 - (c.embedding <=> query_embedding) as similarity,
      (c.id in (select id from kw_chunks)) as is_keyword_hit
    from talk_chunks c
    where c.talk_id in (select talk_id from fused)
      and (c.id in (select id from sem_chunks) or c.id in (select id from kw_chunks))
  ),
  ranked_passages as (
    select p.*,
      row_number() over (
        partition by p.talk_id order by p.is_keyword_hit desc, p.similarity desc
      ) as rn
    from passages p
  )

  select
    f.talk_id,
    min(p.title),
    min(p.speaker),
    min(p.year),
    min(p.season),
    min(p.url),
    f.rrf::float,
    max(p.similarity),
    count(*)::int,
    array_agg(
      case when length(p.text) > 300 then left(p.text, 300) || '…' else p.text end
      order by p.rn
    ) filter (where p.rn <= 2),
    f.semantic_rank,
    f.keyword_rank
  from fused f
  join ranked_passages p on p.talk_id = f.talk_id
  group by f.talk_id, f.rrf, f.semantic_rank, f.keyword_rank
  order by f.rrf desc;
$$;
