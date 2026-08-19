-- ============================================================================
-- 059: day requirements that scale with the day's case count, not just a
-- flat quantity.
--
-- 051 modelled the revision totes correctly: two per knee day, no matter how
-- many knees. But the efficiency totes are a different shape entirely -- one
-- per side per case, PLUS one spare per side. Three right knees and two left
-- knees means 4 right efficiency totes and 3 left, worked out from the day's
-- actual side split, not a flat number a rep would have to keep recomputing
-- by hand every morning.
--
-- 'flat' keeps every existing row's behavior exactly as it was: quantity
-- means quantity, once, if the day matches. 'per_side_plus_one' reinterprets
-- quantity as a buffer added on top of however many cases that day actually
-- have a given side -- and produces one line per side, not one line for the
-- whole day, since "how many" is now a per-side question.
-- ============================================================================

alter table day_requirements
  add column if not exists scaling text not null default 'flat'
    check (scaling in ('flat', 'per_side_plus_one'));
