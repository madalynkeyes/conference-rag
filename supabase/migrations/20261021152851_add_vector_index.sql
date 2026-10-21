set max_parallel_maintenance_workers = 0;
set maintenance_work_mem = '64MB';

create index if not exists sentence_embeddings_embedding_idx
on sentence_embeddings
using ivfflat (embedding vector_cosine_ops)
with (lists = 50);