-- Step 2a: a new table for paragraph-sized chunks.
-- Run this in Supabase Dashboard -> SQL Editor BEFORE running 06_build_chunks.py.
-- sentence_embeddings stays as-is (keyword search and RAG still use it).

create table if not exists talk_chunks (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null,
  title text not null,
  speaker text,
  calling text,
  year int,
  season text,
  url text,
  chunk_num int,
  first_sentence int,
  last_sentence int,
  text text not null,          -- the passage itself (shown on the site)
  embed_text text not null,    -- header + passage (what was embedded)
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists talk_chunks_talk_id_idx on talk_chunks(talk_id);

-- Same security as sentence_embeddings: logged-in users can read,
-- only the service role (your Python script) can write.
alter table talk_chunks enable row level security;

drop policy if exists "Allow authenticated users to read" on talk_chunks;
create policy "Allow authenticated users to read"
on talk_chunks for select
to authenticated
using (true);
