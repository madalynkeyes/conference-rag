-- Personal Study Journal: one row per saved question + answer.
-- Run in Supabase Dashboard -> SQL Editor.

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),

  -- Who owns this entry. Defaults to the logged-in user's id (read from their JWT),
  -- so the browser never has to send it. The foreign key ties it to a real account,
  -- and "on delete cascade" removes a user's entries if their account is deleted.
  user_id uuid not null default auth.uid()
          references auth.users (id) on delete cascade,

  question text not null,
  answer text not null,
  talks jsonb not null default '[]',   -- [{ "title", "speaker", "url" }, ...]
  created_at timestamptz not null default now()
);

-- Fast "my entries, newest first"
create index if not exists journal_entries_user_created_idx
  on journal_entries (user_id, created_at desc);

-- Row Level Security: each user can only see and change THEIR OWN rows.
alter table journal_entries enable row level security;

drop policy if exists "Read own entries" on journal_entries;
create policy "Read own entries" on journal_entries
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Insert own entries" on journal_entries;
create policy "Insert own entries" on journal_entries
  for insert to authenticated
  with check (auth.uid() = user_id);   -- can't save a row "as" someone else

drop policy if exists "Delete own entries" on journal_entries;
create policy "Delete own entries" on journal_entries
  for delete to authenticated
  using (auth.uid() = user_id);

-- (No update policy: entries are save/delete only, so updates are blocked.)
