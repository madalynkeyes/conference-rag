-- match_talks: semantic search that returns TALKS instead of sentences.
--
-- 1. Find the closest sentences (candidate_count of them, default 200).
-- 2. Group them by talk.
-- 3. Score each talk = its best sentence similarity
--                      + 0.01 for each extra matching sentence (bonus capped at 0.05).
--    So a talk with several relevant passages beats one with a single lucky sentence,
--    but a talk can't win just by being long.
-- 4. Return the top match_count talks, each with its 3 best-matching sentences.

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
  matching_sentences int,
  top_sentences text[]
)
language sql stable
-- Later experiment: uncomment to search the 5 closest IVFFlat groups instead of 1
-- (better recall, still fast). Kept off so this round only tests grouping by talk.
-- set ivfflat.probes = 5
as $$
  with candidates as (
    select
      se.talk_id, se.title, se.speaker, se.year, se.season, se.url, se.text,
      1 - (se.embedding <=> query_embedding) as similarity
    from sentence_embeddings se
    where se.embedding is not null
    order by se.embedding <=> query_embedding
    limit candidate_count
  ),
  ranked as (
    select c.*,
      row_number() over (partition by c.talk_id order by c.similarity desc) as rn
    from candidates c
  )
  select
    r.talk_id,
    min(r.title),
    regexp_replace(min(r.speaker), '^By\s+', ''),   -- fixes "By By President ..."
    min(r.year),
    min(r.season),
    min(r.url),
    max(r.similarity) + 0.01 * least(count(*) - 1, 5) as score,
    max(r.similarity),
    count(*)::int,
    array_agg(r.text order by r.similarity desc) filter (where r.rn <= 3)
  from ranked r
  group by r.talk_id
  order by score desc
  limit match_count;
$$;
