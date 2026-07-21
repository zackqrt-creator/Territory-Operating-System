-- ============================================================================
-- TKA checklist: drop the "Cement" consumable line.
--
-- The default TKA case template (seeded in migration 001) included a
-- "Cement" consumable requirement, but neither surgeon on this territory
-- uses cement — every knee here is cementless, so a checklist that flags
-- cement as needed/missing is just noise every single case.
-- ============================================================================

delete from case_template_items
where category = 'consumable'
  and name = 'Cement'
  and template_id in (select id from case_templates where name = 'TKA');
