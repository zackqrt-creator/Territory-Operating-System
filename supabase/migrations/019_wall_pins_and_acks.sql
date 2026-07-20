-- Team wall: pin-to-top and 👍 acknowledgments.
--
-- pinned: any teammate can pin a post that should stay visible (the board is
-- already fully collaborative — same open policy as done-toggles).
-- acked_by: who has tapped "👍 seen it" — turns "did anyone read my hand-off?"
-- into a visible count instead of a guess.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'board_posts' and column_name = 'pinned'
  ) then
    alter table board_posts add column pinned boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'board_posts' and column_name = 'acked_by'
  ) then
    alter table board_posts add column acked_by uuid[] not null default '{}';
  end if;
end $$;
