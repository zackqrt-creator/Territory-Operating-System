# State of the build

What exists, what does not, and what has to come first. Written 2026-08-04.
Kept in the repo on purpose: this project has lost its thread to context limits
and stale branches more than once, and a roadmap that lives in a chat window is
a roadmap that gets rebuilt from scratch every time.

Counts as of commit `483a55e`: **51 migrations, 38 tables, 24 screens,
30 components, 19 library modules.**

---

## Layer 0 — Platform

| | |
| --- | --- |
| React 19 + Vite + TypeScript, `tsc -b` clean | done |
| Tailwind v4, light theme by ramp inversion in `index.css` | done |
| Supabase Postgres, 36 tables, RLS on every one via `my_territory_id()` | done |
| Auth + profiles + territory scoping | done |
| PWA: service worker, precached chunks, installable, offline shell | done |
| Route-level code splitting — Home and Login eager, everything else lazy | done |
| Vercel deploy from `main` | done |
| Public URL on a domain worth typing | **not done** |

Multi-tenancy is real, not aspirational. Every table carries `territory_id` and
every policy checks it. Adding a second rep or a second territory is a data
operation, not a rewrite.

## Layer 1 — Data model

| | |
| --- | --- |
| `catalog_items` — the dictionary. 931 rows, GTIN, joint, side, device type | done |
| `inventory_items` — physical stock at a location. **7 rows** | schema done, **empty** |
| `facilities` — 11 real ones, typed (storage / surgical / trunk) | done |
| `cases`, `surgeons`, `case_templates`, `case_template_items` | done |
| `tote_templates` / `tote_template_items` — named kits and their contents, 860 rows, with `pack_layer` ordering | done |
| `movements` — the audit trail every engine derives from | done |
| `case_checklist_marks` — manual tick-off | done, live |
| `day_requirements` / `day_checklist_marks` — what travels per *day*, not per case | done, live |
| Single-use vs. returnable instrumentation | **not modelled** |

**The gap that matters: 931 catalog rows against 7 inventory rows.** The
dictionary is rich and the stock ledger is empty. Every engine downstream reads
`inventory_items`, so every engine is currently answering questions about a
territory that, as far as the database knows, holds six objects.

## Layer 2 — Engines

Pure functions in `src/lib/`, no I/O, all unit-testable.

| Module | What it answers | State |
| --- | --- | --- |
| `readiness.ts` | Is this case covered, and if not, where is the missing thing | done — now side-aware and tote-level |
| `packlist.ts` | Aggregate demand across a week, ordered by pack layer | done — reads tote BOMs via surgeon preferences |
| `staging.ts` | What goes in the car tonight, per-case haul plus the day's constants | done |
| `loaners.ts` | Ship-by countdowns and extension suggestions | done |
| `labelParse.ts` | GS1 DataMatrix → REF, lot, expiry | done |
| `stickerSheet.ts` | Post-case sticker sheet → usage + reorder | done |
| `packingSlip.ts` | Packing slip → expected contents, and a new REF → a catalog entry | done |
| `inventoryReadiness.ts` | Do I have enough of this, and where from | done |
| `crm.ts` | Case score, preference cards, credential door-check, expiring lots | done |
| `runsheet.ts`, `activity.ts` | Day view; movements → plain English | done |
| `ocr.ts` | On-device Tesseract, rotation-scored, image never leaves the phone | done |
| `markdownExport.ts` | Notes → Markdown vault, with a dependency-free zip writer | done |
| `notesView.ts` | Which sidebar buckets exist and what falls in them | done |

`readiness.ts` does **not** read `tote_template_items`. `packlist.ts` does. So
the app knows what is inside a tote when it is planning a week's demand, and
does not know when it is checking whether a single case is covered. That is a
wiring gap, not a missing feature — see "What comes first" below.

## Layer 3 — Screens

All 24 built and routed.

**Core loop** — Home (alerts, schedule, staging), Calendar, AddCase, RunSheet,
Readiness, PackList, StagingReport, Inventory (on-hand / catalog / sets /
movements), Scan, LoanerReturns, Sets, Surgeons, Tasks, ActivityFeed.

**Second brain** — Notes, NoteDetail, SecondBrainQueue, Wiki, WikiPage, with
wikilinks and note-kind routing. Notes and tasks attach to any entity.
Capture is a single textarea (first line becomes the title); browsing is an
OneNote-style sidebar listing only non-empty buckets; the whole notebook
exports as a zip of Markdown files that opens directly as an Obsidian vault.

**Team / ops** — TeamBoard, QaWall, Compliance, Billing.

## Layer 4 — Capture

| | |
| --- | --- |
| GS1 DataMatrix / barcode scan → populates REF, lot, expiry | done |
| Sticker sheet photo → OCR → matched usage → deduction | done |
| Packing slip photo → OCR → expected contents | done |
| Camera **and** photo-library upload, everywhere a photo is asked for | done — two separate inputs, because `capture` removes the library on phones |
| Photos on tasks, trays, loaners, assets | done |
| Sticker sheet confirm blocked when nothing matched inventory | **bug** |

The upload-later requirement is built. `StickerSheetCapture` carries two hidden
inputs — `cameraRef` and `uploadRef` — precisely so a rep who is logging at
9pm can pick the photo they took at 11am.

## Not built at all

- **Most of the AI.** One call now exists: `supabase/functions/link-note`
  proposes which surgeon, facility or case a captured note is about. It is a
  server function because an Anthropic key cannot live in a client bundle, and
  it suggests rather than writes. Everything else in `product_vision.md` that
  assumes an agent is still unbuilt. OCR remains Tesseract — pattern matching,
  not a model.
- **Notification delivery.** `tasks.assigned_to` exists and the UI shows who a
  task is assigned to. Nothing pings anyone. No web push, no email, no badge.
- **Tasks on the Home screen.** Home shows alerts, schedule and staging only.
- **MyOps integration.** CSV paste-import exists (`parseMyopsCsv.ts`). Whether
  MyOps has an API is still unknown.
- **Counting what is already on the shelf.** Receipt paths now exist for stock
  arriving (slip photo, tote receipt), but nothing helps audit stock that is
  already there and was never entered.

---

## What comes first

Three infrastructure items, in order. Each unblocks the ones after it.

### 1. Fill the stock ledger

Nothing else matters until `inventory_items` reflects reality. Six rows is not
a data problem to work around, it is the reason readiness reports missing on
lines that are sitting in the trunk. Two pieces:

- ~~Apply migration 050 so manual tick-off works as the stopgap.~~ Applied.
- ~~Make a photographed delivery note create stock and teach the catalog.~~ Done.
- ~~Build **tote receipt**.~~ Done — Add inventory → *Whole tote* picks a
  template, names the tote in the checklist's own vocabulary, and writes the
  tote plus all its contents in one action. A KA One Complete Tote is 75 rows
  from one button.

The paths are all built. What remains is the typing: someone has to receive the
totes that are already on the shelves. That is an afternoon, not a feature.

### 2. Teach readiness to open a tote

Once totes create real stock, `readiness.ts` should read
`tote_template_items` the way `packlist.ts` already does. Then "do I have a
size 4+ femoral" resolves through "is the complete tote here" without anyone
maintaining a second list. This is the payoff for step 1 and is maybe a day of
work once the data is real.

### 3. Notification transport

`assigned_to` is a column with no delivery. Options are a Home-screen badge
(cheap, no infrastructure, works today) or real Web Push (service worker
already registered, needs VAPID keys and a `push_subscriptions` table). The
badge is the honest first move; push is worth it only once more than one person
uses the app daily.

**Then AI.** ~~The cheapest high-value call is entity-linking at note capture.~~
Built — `link-note`, one Haiku call, a fraction of a cent per note. Needs
`ANTHROPIC_API_KEY` set as a Supabase secret and the function deployed; until
then it degrades to silence. The catalog is deliberately excluded from its
candidate list on cost grounds; adding it back needs a pre-filter, not a bigger
prompt.

## Known bugs

- `StickerSheetCapture.tsx:400` — confirm is `disabled={saving || unitCount === 0}`,
  so a sticker sheet where nothing matched inventory cannot be saved, which is
  the exact case where a reorder task is most needed.
- Four pre-existing lint warnings (`packingSlip.ts` escapes, `useAuth.tsx`
  fast-refresh). Documented in AGENTS.md; not new.
