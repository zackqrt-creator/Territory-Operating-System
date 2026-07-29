-- Make the notes views obey the querying user's RLS instead of the view
-- owner's. Without security_invoker, a view runs with the privileges of
-- whoever created it, which would let any authenticated user read every
-- territory's notes through the view even though the underlying tables are
-- correctly locked down by my_territory_id().
--
-- Idempotent: setting the option to the value it already has is a no-op, so
-- this is safe to run whether or not it was already applied by hand.

alter view territory_note_feed set (security_invoker = true);
alter view territory_second_brain_queue set (security_invoker = true);
