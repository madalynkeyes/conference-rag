# SQL run in the Supabase SQL Editor

These scripts were run by hand (in this order) while improving search. They are kept here as a record.

| File | What it does |
|---|---|
| `01_match_talks_grouped_by_talk.sql` | `match_talks()`: semantic search that returns talks instead of sentences |
| `02_create_talk_chunks.sql` | `talk_chunks` table (paragraph chunks + contextual headers) with RLS |
| `03_chunk_index_and_match_talks.sql` | IVFFlat index on chunks; `match_talks()` switched to chunks |
| `04_free_space_drop_sentence_vectors.sql` | Drops sentence-level vectors to stay under the 500 MB free tier |
| `05_hybrid_search.sql` | Full-text column + GIN index + `hybrid_match_talks()` (semantic + keyword, merged with RRF) |
| `06_remove_non_talks.sql` | Removes sustainings/reports that the scraper saved as talks |
| `07_study_journal.sql` | `journal_entries` table with per-user RLS (`auth.uid() = user_id`) |

`scripts/06_build_chunks.py` builds the chunks between steps 02 and 03.
