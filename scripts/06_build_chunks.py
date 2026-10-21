"""
Step 6: Build Paragraph Chunks with Contextual Headers
========================================================
Turns single sentences into paragraph-sized chunks (one idea each),
adds a header with the talk's title/speaker/date, embeds them, and
uploads them to the talk_chunks table.

How chunks are made (semantic segmentation):
  - Uses the sentence embeddings you ALREADY have (no extra cost).
  - Compares the 2 sentences before each gap with the 2 sentences after it.
  - Where that similarity drops (the speaker changed topics), it starts a new chunk.
  - Chunks are kept between MIN_SENTENCES and MAX_SENTENCES / MAX_WORDS.

Usage (from the project root, venv active):
    python scripts/06_build_chunks.py

Input:
    scripts/output/sentences_with_embeddings.json   (from step 04)
Output:
    scripts/output/chunks.json                       (chunks, no embeddings)
    scripts/output/chunks_with_embeddings.json       (safety net, resumable)

Prerequisites:
    - Run 01_create_talk_chunks.sql in the Supabase SQL Editor first
    - config.public.json, config.secret.json (OPENAI_API_KEY, SUPABASE_SERVICE_KEY)

Cost: roughly the length of all talks once (~1M tokens) -> a few cents.
"""

import json
import math
import os
import re
import sys
import time

INPUT_FILE = os.path.join('scripts', 'output', 'sentences_with_embeddings.json')
CHUNKS_FILE = os.path.join('scripts', 'output', 'chunks.json')
OUTPUT_FILE = os.path.join('scripts', 'output', 'chunks_with_embeddings.json')

# ---- Tuning knobs ----
MIN_SENTENCES = 3      # never make a chunk shorter than this (except a very short talk)
MAX_SENTENCES = 8      # always cut after this many sentences
MAX_WORDS = 220        # ...or after this many words
WINDOW = 2             # sentences on each side of a gap to compare
BREAK_PERCENTILE = 30  # a gap is a "topic change" if its similarity is in the lowest 30% for that talk
EMBED_BATCH = 100
UPLOAD_BATCH = 50


# ============================================================
# Segmentation
# ============================================================

def normalize(v):
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def mean_vec(vecs):
    dim = len(vecs[0])
    out = [0.0] * dim
    for v in vecs:
        for i, x in enumerate(v):
            out[i] += x
    return normalize(out)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def gap_similarities(embs):
    """similarity[i] = how similar the text just before gap i is to the text just after it.
    Gap i sits between sentence i and sentence i+1."""
    try:
        import numpy as np  # much faster if installed; pure Python fallback below
        E = np.array(embs)
        sims = []
        for i in range(len(embs) - 1):
            b = E[max(0, i - WINDOW + 1): i + 1].mean(axis=0)
            a = E[i + 1: i + 1 + WINDOW].mean(axis=0)
            sims.append(float(b @ a / (np.linalg.norm(b) * np.linalg.norm(a))))
        return sims
    except ImportError:
        pass
    sims = []
    for i in range(len(embs) - 1):
        before = embs[max(0, i - WINDOW + 1): i + 1]
        after = embs[i + 1: i + 1 + WINDOW]
        sims.append(dot(mean_vec(before), mean_vec(after)))
    return sims


def percentile(values, pct):
    s = sorted(values)
    if not s:
        return 0.0
    k = (len(s) - 1) * pct / 100
    lo, hi = math.floor(k), math.ceil(k)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def segment_talk(sentences):
    """sentences: list of records sorted by sentence_num, each with 'text' and 'embedding'.
    Returns a list of lists of sentence records (the chunks)."""
    if len(sentences) <= MIN_SENTENCES:
        return [sentences]

    embs = [normalize(s['embedding']) for s in sentences]
    sims = gap_similarities(embs)
    threshold = percentile(sims, BREAK_PERCENTILE)

    chunks, current, words = [], [], 0
    for i, sent in enumerate(sentences):
        current.append(sent)
        words += len(sent['text'].split())
        is_last = i == len(sentences) - 1
        if is_last:
            break
        # A topic change = a low point: below the threshold AND lower than the gaps next to it
        is_local_min = (i == 0 or sims[i] <= sims[i - 1]) and (i == len(sims) - 1 or sims[i] <= sims[i + 1])
        topic_change = sims[i] <= threshold and is_local_min
        too_long = len(current) >= MAX_SENTENCES or words >= MAX_WORDS
        if (len(current) >= MIN_SENTENCES and topic_change) or too_long:
            chunks.append(current)
            current, words = [], 0

    if current:
        # A tiny leftover at the end gets merged into the previous chunk
        if chunks and len(current) < MIN_SENTENCES:
            chunks[-1].extend(current)
        else:
            chunks.append(current)
    return chunks


# ============================================================
# Contextual header
# ============================================================

def clean_speaker(speaker):
    return re.sub(r'^By\s+', '', speaker or '').strip()


def make_header(talk):
    speaker = clean_speaker(talk['speaker'])
    calling = (talk.get('calling') or '').strip()
    who = f"{speaker}, {calling}" if calling else speaker
    when = f"{talk.get('season') or ''} {talk.get('year') or ''}".strip()
    return f'General Conference talk "{talk["title"]}" by {who} ({when}).'


# ============================================================
# Main
# ============================================================

def build_chunks():
    if not os.path.exists(INPUT_FILE):
        print(f"❌ {INPUT_FILE} not found. Run scripts/04_embed_data.py first.")
        sys.exit(1)

    print("Loading sentence embeddings (this file is large, give it a moment)...")
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        records = json.load(f)
    print(f"   Loaded {len(records):,} sentences")

    talks = {}
    for r in records:
        if r.get('embedding'):
            talks.setdefault(r['talk_id'], []).append(r)
    n_talks = len(talks)
    print(f"   {n_talks:,} talks\n")

    chunk_records = []
    for n, (talk_id, sents) in enumerate(talks.items(), 1):
        sents.sort(key=lambda s: s['sentence_num'])
        header = make_header(sents[0])
        for chunk_num, chunk in enumerate(segment_talk(sents), 1):
            text = ' '.join(s['text'] for s in chunk)
            t = chunk[0]
            chunk_records.append({
                'talk_id': talk_id,
                'title': t['title'],
                'speaker': clean_speaker(t['speaker']),
                'calling': t.get('calling'),
                'year': t.get('year'),
                'season': t.get('season'),
                'url': t.get('url'),
                'chunk_num': chunk_num,
                'first_sentence': chunk[0]['sentence_num'],
                'last_sentence': chunk[-1]['sentence_num'],
                'text': text,
                'embed_text': f"{header}\n\n{text}",
            })
        if n % 50 == 0:
            print(f"   Segmented {n}/{n_talks} talks...")

    del records, talks  # free memory before embedding

    sizes = [r['last_sentence'] - r['first_sentence'] + 1 for r in chunk_records]
    print(f"\n✅ {len(chunk_records):,} chunks "
          f"(avg {sum(sizes) / len(sizes):.1f} sentences, "
          f"{len(chunk_records) / n_talks:.1f} chunks per talk)")
    print("\nExample chunk (exactly what gets embedded):\n" + "-" * 60)
    print(chunk_records[len(chunk_records) // 2]['embed_text'])
    print("-" * 60 + "\n")

    with open(CHUNKS_FILE, 'w', encoding='utf-8') as f:
        json.dump(chunk_records, f, ensure_ascii=False)
    return chunk_records


def embed_chunks(chunk_records, secrets):
    from openai import OpenAI
    from tqdm import tqdm

    done = []
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            done = json.load(f)
        if len(done) >= len(chunk_records):
            print(f"✅ All chunks already embedded in {OUTPUT_FILE} (delete it to re-embed)")
            return done
        print(f"   ⏩ Resuming from chunk {len(done):,}")

    client = OpenAI(api_key=secrets['OPENAI_API_KEY'])
    todo = chunk_records[len(done):]
    for i in tqdm(range(0, len(todo), EMBED_BATCH), desc="Embedding"):
        batch = todo[i:i + EMBED_BATCH]
        for attempt in range(3):
            try:
                resp = client.embeddings.create(
                    model='text-embedding-3-small',
                    input=[c['embed_text'] for c in batch],
                )
                break
            except Exception as e:
                if attempt == 2:
                    raise
                print(f"\n   Retrying after error: {e}")
                time.sleep(3)
        for c, item in zip(batch, resp.data):
            done.append({**c, 'embedding': item.embedding})
        if (i // EMBED_BATCH + 1) % 10 == 0:
            with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                json.dump(done, f, ensure_ascii=False)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(done, f, ensure_ascii=False)
    chars = sum(len(c['embed_text']) for c in done)
    print(f"✅ Embedded {len(done):,} chunks (≈ ${chars / 4 / 1_000_000 * 0.02:.3f})")
    return done


def upload_chunks(chunks, public_config, secrets):
    from supabase import create_client
    from tqdm import tqdm

    client = create_client(public_config['SUPABASE_URL'], secrets['SUPABASE_SERVICE_KEY'])

    existing = client.table('talk_chunks').select('id', count='exact').limit(1).execute().count or 0
    if existing:
        print(f"❌ talk_chunks already has {existing:,} rows.")
        print("   Run this in the SQL Editor, then run the script again:")
        print("     truncate table talk_chunks;")
        sys.exit(1)

    errors = 0
    for i in tqdm(range(0, len(chunks), UPLOAD_BATCH), desc="Uploading"):
        batch = chunks[i:i + UPLOAD_BATCH]
        try:
            client.table('talk_chunks').insert(batch).execute()
        except Exception as e:
            print(f"\n   ❌ Batch {i // UPLOAD_BATCH}: {e}")
            errors += len(batch)

    total = client.table('talk_chunks').select('id', count='exact').limit(1).execute().count or 0
    print(f"\n✅ Upload complete: {total:,} rows in talk_chunks"
          + (f" ({errors} failed)" if errors else ""))


def main():
    with open('config.public.json', 'r') as f:
        public_config = json.load(f)
    with open('config.secret.json', 'r') as f:
        secrets = json.load(f)

    print("=" * 60)
    print("Building paragraph chunks with contextual headers")
    print("=" * 60)
    chunk_records = build_chunks()
    chunks = embed_chunks(chunk_records, secrets)
    upload_chunks(chunks, public_config, secrets)
    print("\nNext: run 02_index_and_match_talks.sql in the Supabase SQL Editor.")


if __name__ == '__main__':
    main()
