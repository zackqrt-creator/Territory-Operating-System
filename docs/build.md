# Territory OS — Build Log & Blueprint

> Single source of truth for **how this was built and why**.
> Live app data (cases, inventory, notes, tasks, permissions, catalog) lives in **Supabase**.
> This file holds the **blueprint, development history, and decisions** — the second brain for the build itself.

- **Repo:** `zackqrt-creator/Territory-Operating-System` (formerly `Claude-skills`)
- **Working branch:** `claude/casetrack-inventory-pwa-9ngunk`
- **Stack:** Vite + React 19 + TypeScript + TailwindCSS 4 · Supabase (Postgres + RLS + magic-link auth) · PWA · deployed on Vercel
- **Last updated:** 2026-07-29

---

## 1. What Claude is working on

The app is **Territory OS** (originally "CaseTrack 2.0"): a mobile-first PWA for a Medacta orthopedic device rep to run territory inventory + surgical case logistics.

Current focus areas, in order they were tackled:

1. **Products catalog module** — loading real myOPS packing-list exports into a 3-layer catalog (Procedures → Sets → packing-list items). *(mostly done — 9 procedures loaded)*
2. **Notes / second brain** — a two-layer team-memory system (capture → review → durable knowledge). *(built, needs live test)*
3. **UI cleanup sprint** — lucide icons, new bottom nav, command-center Home, tabbed Inventory. *(built, needs live test)*

Explicitly **paused / not built** (by instruction): calendar revamp, myOPS calendar subscription, surgeon-specific custom pack items, Obsidian live sync.

---

## 2. Migrations created

All migrations are numbered files in `supabase/migrations/`. Earlier Claude sessions could not reach Supabase and required manual paste into the SQL editor; sessions with a working Supabase MCP connector can inspect and apply migrations directly.

### Catalog module (3-layer: `case_templates` → `procedure_sets` → `tote_templates` → `tote_template_items`, all referencing `catalog_items`)

| # | File | What it loads |
|---|------|----------------|
| 026 | `procedure_sets_and_codes.sql` | Records the procedure_sets join schema + `code` columns as a proper migration |
| 027 | `gskaimpl_set.sql` | First real Set: GSKAIMPL |
| 028 | `gskaimpr_gstirve_and_procedure.sql` | GSKAIMPR + GSTIRVE, "500 GMK SpheriKA Right" procedure |
| 029 | `patres_500metal_500katrr.sql` | PATRES, 500METAL, 500KATRR |
| 030 | `6_1blks_set.sql` | 6-1BLKS — completes 500 GMK SpheriKA **Right** |
| 031 | `gstilve_500katrl_and_left_procedure.sql` | GSTILVE + 500KATRL — completes 500 GMK SpheriKA **Left** |
| 032 | `catalog_search_and_linkability.sql` | `pg_trgm` + trigram search indexes; extends `entity_notes` entity_type to catalog/tote/case_template |
| 033 | `tasks_entity_linkability.sql` | Nullable `entity_type`/`entity_id` on `tasks` (schema direction only) |
| 034 | `gsfetil_500sptrl_and_sphere_left_case.sql` | GSFETIL + 500SPTRL — "500 Sphere KA Left Case" |
| 035 | `500sptrr_gsfetir_and_sphere_right_case.sql` | 500SPTRR + GSFETIR — "500 Sphere KA Right Case" |
| 036 | `sphtinl_and_sphere_ka_tin_left_case.sql` | SPHTINL — "500 Sphere KA TiN Left" |
| 037 | `sphtinr_and_sphere_ka_tin_right_case.sql` | SPHTINR — "500 Sphere KA TiN Right" |
| 038 | `case_template_alt_name.sql` | `alt_name` alias so "500 Sphere Left Case" == "500 Sphere KA Left Case" |
| 039 | `gmk_revision_grfeml_gext_ginsert_tiaug_revt.sql` | 5 of 6 GMK Revision Sets (incl. 263-item REVT tray) |
| 040 | `grfemr_titibaug_and_gmk_revision_cases.sql` | GRFEMR + TITIBAUG — completes GMK Revision **Left** and **Right** |
| 041 | `gmk_sphere_300_left_case.sql` | 300METAL, GMKS2.0, SPRTRL — "GMK Sphere 300 Left Case" |

### Notes / second brain

| # | File | What it does |
|---|------|---------------|
| 042 | `territory_notes_second_brain.sql` | Creates `territory_notes`, `territory_note_links`, `territory_note_tags`, `territory_note_tag_assignments`, the `territory_note_feed` + `territory_second_brain_queue` views, RLS, and extends `tasks.entity_type` to include `'note'` |
| 043 | `note_kinds_logistics_playbook.sql` | Widens the `territory_notes.note_type` check to 14 values. Eight have UI (`general`, `case`, `surgeon`, `hospital`, `inventory`, `replenishment`, `logistics`, `playbook`); the other six (`loaner`, `consignment`, `task`, `meeting`, `idea`, `ai_summary`) are accepted by the DB and render with a fallback icon. **Applied.** |
| 044 | `notes_views_security_invoker.sql` | Sets `territory_note_feed` and `territory_second_brain_queue` to `security_invoker = true` so the views obey the querying user's RLS. **Applied 2026-07-29.** |

### Calendar revamp

| # | File | What it does |
|---|------|---------------|
| 045 | `case_coverage_and_calendar_blocks.sql` | `case_assignees` (attach a second rep to a case: primary / covering / observing) and `calendar_blocks` (non-case time: hospital visits, in-services, travel, admin, personal). RLS via `my_territory_id()`; blocks are editable only by their own rep. **Applied 2026-07-29.** |

### Tasks

| # | File | What it does |
|---|------|---------------|
| 046 | `task_photos.sql` | `task_photos` — photos attached to a task and tagged with the stage (`todo` / `doing` / `done`) they document. Reuses the public `item-photos` storage bucket from 008. Visibility follows the task's own share rules. **Applied 2026-07-29.** |

> **On migration numbering.** Migrations are run by pasting into the Supabase
> SQL editor, whose saved snippets are just labelled queries — there is no
> migration ledger, no ordering, and no record of what actually ran. Snippet
> titles have drifted from these filenames (046 was pasted as a snippet named
> "049", and 044/045 were left untitled). **The filenames here are the ledger**;
> snippet names carry no meaning and should not be matched.

**Run order for the notes system:** `032` → `042` → `043` → `044` (032 provides `pg_trgm`; 044 secures the views). 033 is a prerequisite of 042.

### Procedures loaded so far (9)

500 GMK SpheriKA Right · 500 GMK SpheriKA Left · 500 Sphere KA Left Case · 500 Sphere KA Right Case · 500 Sphere KA TiN Left · 500 Sphere KA TiN Right · GMK Revision Left · GMK Revision Right · GMK Sphere 300 Left Case.

---

## 3. Files changed (application code)

Schema/catalog work (026–041) touched **only** `supabase/migrations/**` — no app code.

The **Notes** + **UI cleanup** sprints touched app code:

**New files**
- `src/pages/Notes.tsx` — Notes capture feed (8 kinds, search, filters, quick-capture FAB)
- `src/pages/NoteDetail.tsx` — single raw note: edit, type/visibility/pin/archive, entity links, spawn tasks
- `src/pages/SecondBrainQueue.tsx` — review queue + **Promote to knowledge page**
- `src/components/QuickCaptureNote.tsx` — mobile-first capture modal
- `src/lib/noteKinds.ts` — the 8 capture kinds + their lucide icons (shared)

**Repurposed**
- `src/pages/Wiki.tsx` → now the **Knowledge base** at `/pages` (durable pages)
- `src/pages/WikiPage.tsx` → durable page detail at `/pages/:id`
- `src/pages/NotesSearch.tsx` → **deleted** (old entity_notes-backed search)

**Reworked**
- `src/pages/Home.tsx` — field-ops command center (Needs attention · Schedule · Staging · Inventory pulse · Tasks & team · Recent activity); billing/credentials removed
- `src/pages/Inventory.tsx` — tabbed: **On-hand · Catalog · Sets · Movements**
- `src/components/BottomNav.tsx` — Home · Cases · Inventory · Tasks · Notes · **More** (overflow sheet), lucide icons
- `src/components/TopBar.tsx` — route titles for `/notes`, `/notes/review`, `/pages`
- `src/components/WikiLinkButton.tsx` — points to `/pages/:id`, lucide icon
- `src/App.tsx` — routes for notes/pages, `/wiki` → `/pages` redirects
- `src/lib/api.ts` — territory-notes CRUD, links, tags, `promoteNoteToPage`, `spawnTaskFromNote`, `listTasksForNote`
- `src/lib/types.ts` — `TerritoryNote*` types; `logistics`/`playbook` kinds; `tasks.entity_type/entity_id`

**Dependency:** added `lucide-react`.

---

## 4. Decisions made

- **Repo renamed** `Claude-skills` → `Territory-Operating-System` (GitHub auto-redirects; git history intact).
- **3-layer catalog** kept: Procedures (`case_templates`) → Sets (`tote_templates` via `procedure_sets`) → items (`tote_template_items` → `catalog_items`). Every insert is **idempotent** (`where not exists` guards), so re-running or duplicate uploads are safe.
- **Duplicate uploads** are diffed byte-for-byte before generating SQL; only genuinely new Sets get loaded. (PATRES/500METAL/GEXT/etc. are ambidextrous and reused across procedures.)
- **"GMK Spherika" (KA) vs plain "GMK Sphere"** are physically different product lines with different femoral trial trays (500KATRx vs 500SPTRx) — kept as separate catalog items even though they share tibial components.
- **Left/Right mirroring** validated: synthesized Right sides matched the real myOPS exports byte-for-byte.
- **Notes = two layers, one product** ("Team Memory + Action", *not* Obsidian):
  - **Capture** = `territory_notes` at `/notes` (8 kinds: quick capture, case debrief, surgeon preference, hospital rule, inventory issue, replenishment note, logistics note, playbook entry). Private by default.
  - **Knowledge** = `pages`/`page_links` at `/pages`, reached by **promoting** a note or via `[[wikilinks]]` / canonical entity pages.
  - **Review queue** at `/notes/review` bridges them (triage → promote).
  - `entity_notes` stays **inline record comments only**. Action items reuse the existing `tasks` table (`entity_type='note'`), not a new table.
  - Obsidian export/sync is optional + behind-the-scenes; never the user-facing product.
- **Billing + credentials removed** from Home/nav — myOPS already handles those. The `/billing` and `/compliance` pages still exist, just unsurfaced.
- **RLS** for all new tables follows the existing `my_territory_id()` pattern (there is **no** `territory_members` table — an earlier draft that assumed one was corrected before it could error).
- **Views must set `security_invoker = true`.** A Postgres view defaults to running with its creator's privileges, which would bypass the underlying RLS. Migration 044 fixes this for the two notes views; any future view needs the same.
- **Icons** standardized on `lucide-react` (replaced emoji) for a professional, consistent look.
- **"No new tables" UI sprint:** 043 only extends a check constraint (allowed); no tables added.

---

## 5. Bugs & blockers

**Supabase access has been inconsistent across sessions.**
- Claude's build sandbox **cannot** reach Supabase over the network: the outbound proxy blocks Supabase's domains (both the DB pooler and `api.supabase.com` return 403), direct Postgres ports 5432/6543 are blocked, and the direct DB host is IPv6-only while the sandbox is IPv4. Verified again 2026-07-29 — unchanged. This is an infra/network-policy limit, **not** a Supabase setting.
- The **Supabase MCP connector** is a separate path that does not go through the sandbox network, so it works where `psql`/`curl` cannot. It has been **flapping** (repeatedly connecting and disconnecting mid-session), so it cannot yet be relied on for a full migration run.
- Net effect: schema changes are still delivered as copy-paste SQL, and UI is verified by `tsc` typecheck + `vite build` + dev-server transform rather than live click-through.

**GitHub write scope.**
This session's git proxy is scoped to the literal repo name `zackqrt-creator/claude-skills`. The renamed `Territory-Operating-System` URL is **readable** (`git ls-remote` works) but **not writable** (push returns 403) — GitHub's rename redirect does not carry write permission through the proxy allowlist. Pushes therefore still use the old remote URL, which lands correctly via the redirect.

**Fixed during the session**
- RLS draft referenced a non-existent `territory_members` table → rewritten to `my_territory_id()` before running.
- Left→Right mirror script initially missed `t3i4L`/`t4i3L` descriptions (only swapped the word "Left") → fixed with regex; later confirmed against real export.
- Copy-paste UX: pasting terminal `cat` output (with the `$` prompt) into Supabase caused `syntax error at "$"` → now SQL is always delivered as a plain code block.
- Home command-center refactor left `openQuestions`/`nextSevenDays`/`upcoming` unused → removed (build is clean).
- Notes views were created without `security_invoker`, so they would have bypassed RLS → migration 044 added.
- **Shipment intake did not actually scan anything** (reported 2026-07-30: *"No scanner or anything was working. I held the box for way longer than I should've and eventually took a picture"*). Two separate causes:
  1. **There was no live scanner on that screen.** `PackingSlipScan` was a file input with `capture="environment"`, so it opened the phone's camera app. A rep holding a box up to it waits forever, because nothing was ever reading the frame — they had to press the shutter. Meanwhile the boxes carry a **GS1 barcode** encoding GTIN + lot + expiry exactly, and `parseGs1()` had been able to read it since the batch-scan work. Fixed: the camera now runs live from the moment the screen opens and decodes barcodes continuously (`html5-qrcode`, formats limited to DATA_MATRIX / CODE_128 / CODE_39 / QR / EAN-13 / ITF, native `BarcodeDetector` used where available). OCR is now the *fallback*, not the only path.
  2. **OCR was fed a 12-megapixel photo.** `Tesseract.recognize()` got the raw camera file — 4032×3024 — across up to four rotations, each spinning up its own worker. That is minutes of phone CPU with a spinner that reports nothing. Fixed in `src/lib/ocr.ts`: downscale to a 2000px long edge before recognizing (still ~30px cap height on a full page), one shared worker for the session instead of one per attempt, real percentage progress off the worker's logger, and a 45s timeout on the first-use CDN download so bad signal fails with an explanation instead of hanging.
- Default camera capture is ~640×480, at which a few-millimetre GS1 data-matrix has its modules land inside single pixels and never decodes. Intake now requests 1080p with `focusMode: "continuous"`.
- A bare 12–14 digit barcode (UPC/EAN) was being handed to the GS1 element-string walker, which read the digits as a lot number. Now treated as a plain GTIN — a GS1 element string is never that short, so there is no ambiguity.
- `parseGs1()` lost everything after a group separator that followed a *fixed*-length field (some scanners emit one anyway): the separator was read as the first digit of the next AI. Now skipped.
- `LoanerIntake` dropped `expiration_date` when mapping contents to `createLoanerTote`, so barcode expiries never reached the expiring-lot warnings.
- **Sets, Catalog and Movements had no way to add, edit or delete** (reported 2026-07-30). Sets were entirely read-only, so a territory's real trays — a complete tote that got split, a travelling insert tray, locally-built revision sets — could not be represented at all. Catalog could only be renamed, so an imported REF typo or a GTIN learned against the wrong product was permanent. Movements could not be corrected, so a mis-scan stayed in the activity feed forever. All three are now fully editable (`SetEditor`, `CatalogItemEditor`, inline movement delete). Tasks, notes and on-hand items already had full CRUD.
- Sets list read "74 items", which could mean 74 distinct products or 74 boxes in the tray. For a complete tote those are very different numbers and the rep checking a tray needs the second. Now "N products · M pieces".
- **A sticker sheet could only be photographed, never uploaded.** `capture="environment"` is not a hint — on a phone it removes the photo library as an option entirely, so a rep who was not in the room had no way to use the picture someone else sent them. Now two inputs: take a photo, or upload (multi-select, since a case's stickers run to two or three pages). The upload path also runs the rotation-trying `ocrPage` rather than upright-only `ocrLabel`, because a sheet shot by someone else on a counter is very often sideways.
- OCR downscaling (2000px) was right for a box label but too aggressive for a page of twenty small stickers, whose REF codes fell below what the recognizer can resolve. `ocrPage` now takes `maxEdge` and `goodEnough`; sticker sheets use `DENSE_PAGE_EDGE` (3200) and stop after two readable REFs, since four passes over a page that size is a long time to stand there.
- **Items consumed to zero still appeared to be in stock.** A sticker sheet deducts quantity to 0 rather than deleting the row (the audit trail hangs off it), but the on-hand list only prints a quantity when it is above 1 — so "0 left" and "1 left" rendered identically. Zero-quantity rows now move to a separate "Used up — awaiting restock" list, which is also exactly what the next restock shipment is replacing.
- These docs were once re-committed as *rendered* markdown, which flattened every table and fused headings into body text (`Casescases`, `Inventorycatalog_items`). Restored from source. **Always paste raw markdown, not rendered output.**

---

## 6. What still needs review

- [x] **Apply 044** — run by Zack on 2026-07-29. The notes views now obey the querying user's RLS.
- [x] **Run 045** — applied by Zack on 2026-07-29. Calendar blocks and case coverage are live.
- [ ] **Confirm the rest of the live schema.** Which of 026–043 are actually applied has **not been verified** — the Supabase connector kept dropping. Worth one audit query.
- [ ] **Live click-through** of the new UI once logged in: Home command center, Notes capture → review → promote-to-page, Inventory tabs (esp. Catalog/Sets showing the loaded myOPS data), the More nav sheet, `/wiki`→`/pages` redirects.
- [ ] **Confirm remaining procedures** to load (TiN Right series for the 300 line, any others myOPS lists).
- [ ] **Surgeon-specific pack customization** — currently `surgeon_preferences` can only swap whole Sets; it cannot add extra or non-catalog items to a surgeon's tray. Design deferred by instruction; revisit when ready.
- [ ] **Second-brain AI pipeline** — `ai_summary`/`ai_action_items`/`ai_entities` columns + status flow exist and are shown in the UI, but nothing populates them yet (manual triage only for now).
- [ ] **Calendar revamp** — 6 of 7 parts built (month/personal default, day-tap day sheet with an hour rail, labelled time blocks, case coverage via `case_assignees`, required add-case time with quick-pick chips, navigate-to-calendar on save). **Remaining: subscribing to the myOPS calendar** — needs an ICS feed URL (env var, not chat) and a policy for subscribed-vs-local edits.
- [ ] **Field-test the live barcode scanner.** The GS1 parsing is verified against real Medacta codes (data-matrix, GS1-128 with separators, the printed UDI line, bare EAN-13/GTIN-14) and the box-label OCR path is verified against Zack's `02.12.3D03L` tibial-tray label both clean and glyph-damaged. What is **not** verified is the camera itself — the sandbox has no camera, so autofocus, capture resolution and real data-matrix decode range are untested on an actual phone.
- [ ] **Run migration 047** (`047_movements_editable.sql`) — adds the update/delete policies `movements` never had, so the log can be corrected. Until it runs, the delete button fails with a message naming the migration rather than a raw RLS error.
- [ ] **Whether the catalog migrations ever ran.** The scanner reports "N in catalog"; if a known REF or GTIN scans as *not in catalog*, 026–041 did not apply. This is the cheapest available probe of live schema state.
