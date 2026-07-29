Territory OS — Build Log & Blueprint

Single source of truth for how this was built and why.Live app data (cases, inventory, notes, tasks, permissions, catalog) lives in Supabase.This file holds the blueprint, development history, and decisions — the second brain for the build itself.

Repo: zackqrt-creator/Territory-Operating-System (formerly Claude-skills)

Working branch: claude/casetrack-inventory-pwa-9ngunk

Stack: Vite + React 19 + TypeScript + TailwindCSS 4 · Supabase (Postgres + RLS + magic-link auth) · PWA · deployed on Vercel

Last updated: 2026-07-28

1. What Claude is working on

The app is Territory OS (originally "CaseTrack 2.0"): a mobile-first PWA for a Medacta orthopedic device rep to run territory inventory + surgical case logistics.

Current focus areas, in order they were tackled this session:

Products catalog module — loading real myOPS packing-list exports into a 3-layer catalog (Procedures → Sets → packing-list items). (mostly done — 9 procedures loaded)

Notes / second brain — a two-layer team-memory system (capture → review → durable knowledge). (built, needs migrations run + live test)

UI cleanup sprint — lucide icons, new bottom nav, command-center Home, tabbed Inventory. (built, needs live test)

Explicitly paused / not built (by instruction): calendar revamp, myOPS calendar subscription, surgeon-specific custom pack items, Obsidian live sync.

2. Migrations created

All migrations are numbered files in supabase/migrations/. Earlier Claude work required manual paste into the Supabase SQL editor; current Codex sessions can use Supabase MCP to inspect and apply migrations directly when the connector is available.

Catalog module (3-layer: case_templates → procedure_sets → tote_templates → tote_template_items, all referencing catalog_items)

#

File

What it loads

026

procedure_sets_and_codes.sql

Records the procedure_sets join schema + code columns as a proper migration

027

gskaimpl_set.sql

First real Set: GSKAIMPL

028

gskaimpr_gstirve_and_procedure.sql

GSKAIMPR + GSTIRVE, "500 GMK SpheriKA Right" procedure

029

patres_500metal_500katrr.sql

PATRES, 500METAL, 500KATRR

030

6_1blks_set.sql

6-1BLKS — completes 500 GMK SpheriKA Right

031

gstilve_500katrl_and_left_procedure.sql

GSTILVE + 500KATRL — completes 500 GMK SpheriKA Left

032

catalog_search_and_linkability.sql

pg_trgm + trigram search indexes; extends entity_notes entity_type to catalog/tote/case_template

033

tasks_entity_linkability.sql

Nullable entity_type/entity_id on tasks (schema direction only)

034

gsfetil_500sptrl_and_sphere_left_case.sql

GSFETIL + 500SPTRL — "500 Sphere KA Left Case"

035

500sptrr_gsfetir_and_sphere_right_case.sql

500SPTRR + GSFETIR — "500 Sphere KA Right Case"

036

sphtinl_and_sphere_ka_tin_left_case.sql

SPHTINL — "500 Sphere KA TiN Left"

037

sphtinr_and_sphere_ka_tin_right_case.sql

SPHTINR — "500 Sphere KA TiN Right"

038

case_template_alt_name.sql

alt_name alias so "500 Sphere Left Case" == "500 Sphere KA Left Case"

039

gmk_revision_grfeml_gext_ginsert_tiaug_revt.sql

5 of 6 GMK Revision Sets (incl. 263-item REVT tray)

040

grfemr_titibaug_and_gmk_revision_cases.sql

GRFEMR + TITIBAUG — completes GMK Revision Left and Right

041

gmk_sphere_300_left_case.sql

300METAL, GMKS2.0, SPRTRL — "GMK Sphere 300 Left Case"

Notes / second brain

#

File

What it does

042

territory_notes_second_brain.sql

Creates territory_notes, territory_note_links, territory_note_tags, territory_note_tag_assignments, the territory_note_feed + territory_second_brain_queue views, RLS, and extends tasks.entity_type to include 'note'

043

note_kinds_logistics_playbook.sql

Extends territory_notes.note_type check with logistics + playbook

044

notes_views_security_invoker.sql

Sets territory_note_feed and territory_second_brain_queue to security_invoker = true so the views obey underlying RLS

Run order for the notes system: 032 → 042 → 043 → 044 (032 provides pg_trgm; 044 secures the views). 033 is a prerequisite of 042 (already run).

Procedures loaded so far (9)

500 GMK SpheriKA Right · 500 GMK SpheriKA Left · 500 Sphere KA Left Case · 500 Sphere KA Right Case · 500 Sphere KA TiN Left · 500 Sphere KA TiN Right · GMK Revision Left · GMK Revision Right · GMK Sphere 300 Left Case.

3. Files changed (application code)

Schema/catalog work (026–041) touched only supabase/migrations/** — no app code.

The Notes + UI cleanup sprints touched app code:

New files

src/pages/Notes.tsx — Notes capture feed (8 kinds, search, filters, quick-capture FAB)

src/pages/NoteDetail.tsx — single raw note: edit, type/visibility/pin/archive, entity links, spawn tasks

src/pages/SecondBrainQueue.tsx — review queue + Promote to knowledge page

src/components/QuickCaptureNote.tsx — mobile-first capture modal

src/lib/noteKinds.ts — the 8 capture kinds + their lucide icons (shared)

Repurposed

src/pages/Wiki.tsx → now the Knowledge base at /pages (durable pages)

src/pages/WikiPage.tsx → durable page detail at /pages/:id

src/pages/NotesSearch.tsx → deleted (old entity_notes-backed search)

Reworked

src/pages/Home.tsx — field-ops command center (Needs attention · Schedule · Staging · Inventory pulse · Tasks & team · Recent activity); billing/credentials removed

src/pages/Inventory.tsx — tabbed: On-hand · Catalog · Sets · Movements

src/components/BottomNav.tsx — Home · Cases · Inventory · Tasks · Notes · More (overflow sheet), lucide icons

src/components/TopBar.tsx — route titles for /notes, /notes/review, /pages

src/components/WikiLinkButton.tsx — points to /pages/:id, lucide icon

src/App.tsx — routes for notes/pages, /wiki → /pages redirects

src/lib/api.ts — territory-notes CRUD, links, tags, promoteNoteToPage, spawnTaskFromNote, listTasksForNote

src/lib/types.ts — TerritoryNote* types; logistics/playbook kinds; tasks.entity_type/entity_id

Dependency: added lucide-react.

4. Decisions made

Repo renamed Claude-skills → Territory-Operating-System (GitHub auto-redirects; git history intact).

3-layer catalog kept: Procedures (case_templates) → Sets (tote_templates via procedure_sets) → items (tote_template_items → catalog_items). Every insert is idempotent (where not exists guards), so re-running or duplicate uploads are safe.

Duplicate uploads are diffed byte-for-byte before generating SQL; only genuinely new Sets get loaded. (PATRES/500METAL/GEXT/etc. are ambidextrous and reused across procedures.)

"GMK Spherika" (KA) vs plain "GMK Sphere" are physically different product lines with different femoral trial trays (500KATRx vs 500SPTRx) — kept as separate catalog items even though they share tibial components.

Left/Right mirroring validated: synthesized Right sides matched the real myOPS exports byte-for-byte.

Notes = two layers, one product ("Team Memory + Action", not Obsidian):

Capture = territory_notes at /notes (8 kinds: quick capture, case debrief, surgeon preference, hospital rule, inventory issue, replenishment note, logistics note, playbook entry). Private by default.

Knowledge = pages/page_links at /pages, reached by promoting a note or via [[wikilinks]] / canonical entity pages.

Review queue at /notes/review bridges them (triage → promote).

entity_notes stays inline record comments only. Action items reuse the existing tasks table (entity_type='note'), not a new table.

Obsidian export/sync is optional + behind-the-scenes; never the user-facing product.

Billing + credentials removed from Home/nav — myOPS already handles those. The /billing and /compliance pages still exist, just unsurfaced.

RLS for all new tables follows the existing my_territory_id() pattern (there is no territory_members table — an earlier draft that assumed one was corrected before it could error).

Icons standardized on lucide-react (replaced emoji) for a professional, consistent look.

"No new tables" UI sprint: 043 only extends a check constraint (allowed); no tables added.

5. Bugs & blockers

Previous blocker — Claude's sandbox could not reach Supabase.The earlier Claude environment could not reach Supabase over the network, so migrations were delivered as copy-paste SQL.

Current Codex status — Supabase MCP access works.Codex can inspect and apply migrations against Zack CaseTrack (tylytbjxizxukefpplcw). On 2026-07-28, Codex verified that the catalog + notes schema exists in the live database and applied migration 044_notes_views_security_invoker.

Current GitHub limitation.The GitHub connector can read zackqrt-creator/Territory-Operating-System, but connector writes returned 403 Resource not accessible by integration. Local clone/edit/build works; pushing may require repo/plugin authorization or normal GitHub credentials in the environment.

Fixed during the session

RLS draft referenced a non-existent territory_members table → rewritten to my_territory_id() before running.

Left→Right mirror script initially missed t3i4L/t4i3L descriptions (only swapped the word "Left") → fixed with regex; later confirmed against real export.

Copy-paste UX: pasting terminal cat output (with the $ prompt) into Supabase caused syntax error at "$" → now SQL is always delivered as a plain code block.

Home command-center refactor left openQuestions/nextSevenDays/upcoming unused → removed (build is clean).

6. What still needs review

Confirm migrations/schema in Supabase — live database contains catalog + notes tables/views/indexes and permits logistics/playbook note kinds.

Apply notes view RLS fix — 044_notes_views_security_invoker applied live and verified via pg_class.reloptions.

Live click-through of the new UI once logged in: Home command center, Notes capture → review → promote-to-page, Inventory tabs (esp. Catalog/Sets showing the loaded myOPS data), the More nav sheet, /wiki→/pages redirects.

Confirm remaining procedures to load (TiN Right series for the 300 line, any others myOPS lists).

Surgeon-specific pack customization — currently surgeon_preferences can only swap whole Sets; it cannot add extra or non-catalog items to a surgeon's tray. Design deferred by instruction; revisit when ready.

Second-brain AI pipeline — ai_summary/ai_action_items/ai_entities columns + status flow exist and are shown in the UI, but nothing populates them yet (manual triage only for now).

Calendar revamp (month/personal default, day-tap time picker, event types, multi-user coverage, add-case time + form reset) — scoped but not built; deprioritized in favor of the UI sprint.
