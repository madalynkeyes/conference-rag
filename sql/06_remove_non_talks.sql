-- Remove conference items that aren't talks (the scraper saved them as talks).
-- They ranked highly for questions like "What have church leaders taught about prayer?"
-- because they are literally lists of church leaders.
delete from talk_chunks
where title ilike 'Sustaining of%'
   or title ilike '%Auditing Department%'
   or title ilike '%Statistical Report%';

delete from sentence_embeddings
where title ilike 'Sustaining of%'
   or title ilike '%Auditing Department%'
   or title ilike '%Statistical Report%';
