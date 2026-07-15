-- Loaner return countdown: your 48-hour return-to-corporate clock, plus a
-- way to track an approved extension (kept a little longer for an upcoming
-- case) instead of shipping back on the default schedule.

alter table inventory_items
  add column if not exists return_extended_until date;

alter table inventory_items
  add column if not exists return_extension_reason text;
