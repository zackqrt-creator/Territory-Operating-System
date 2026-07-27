-- Territory OS Notes exposes eight capture kinds; two of them (logistics
-- note, playbook entry) weren't in the original territory_notes.note_type
-- check. Extend the constraint -- no new tables, just more allowed values.

alter table territory_notes drop constraint if exists territory_notes_note_type_check;
alter table territory_notes add constraint territory_notes_note_type_check
  check (note_type in (
    'general', 'case', 'hospital', 'inventory', 'replenishment',
    'logistics', 'playbook', 'loaner', 'consignment', 'surgeon',
    'task', 'meeting', 'idea', 'ai_summary'
  ));
