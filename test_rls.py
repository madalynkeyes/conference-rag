"""
RLS experiment: connect with ONLY the anon (public) key and see what RLS allows.

Run from the root of your conference-rag project (where config.public.json lives):
    python test_rls.py
"""
from supabase import create_client
import json

with open("config.public.json") as f:
    public = json.load(f)

# Connect with the ANON key (not the service key!)
client = create_client(public["SUPABASE_URL"], public["SUPABASE_ANON_KEY"])

print("Connected with the anon key (no login)\n")

# 1. page_views has a public SELECT policy -> should work
try:
    result = client.table("page_views").select("*").limit(5).execute()
    print(f"1. Read page_views:          {len(result.data)} rows  ✅ allowed")
    if not result.data:
        print("   (0 rows just means no visits recorded yet; there was no error, so access is allowed)")
except Exception as e:
    print(f"1. Read page_views:          ERROR ❌ {e}")

# 2. sentence_embeddings only allows the 'authenticated' role -> RLS filters out every row
try:
    result = client.table("sentence_embeddings").select("*").limit(5).execute()
    print(f"2. Read sentence_embeddings: {len(result.data)} rows  🔒 (expected: 0)")
except Exception as e:
    print(f"2. Read sentence_embeddings: blocked 🔒 {e}")

# 3. Bonus: try to WRITE to sentence_embeddings -> no insert policy for anon, so it's rejected
try:
    client.table("sentence_embeddings").insert({"text": "sneaky row"}).execute()
    print("3. Insert sentence_embeddings: succeeded?! ⚠️  Check your RLS policies")
except Exception as e:
    print(f"3. Insert sentence_embeddings: rejected 🔒\n   {e}")
    print("   (look for 'row-level security' in the message; a 'column not found' error\n"
          "    just means the test row didn't match the table's columns)")

print(
    "\nNotice: reading the protected table didn't raise an error. RLS silently\n"
    "filters out rows you're not allowed to see, so you just get an empty result."
)