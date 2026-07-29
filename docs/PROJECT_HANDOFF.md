Territory OS — Project Handoff / Context Brief

Purpose of this document: bring an outside AI assistant (or a new collaborator) fully up to speed on what this project is, what's been built, how it's architected, where it stands right now, and what the open questions are. Read it top to bottom; nothing else is required.

Date of this snapshot: 2026-07-28

Repo: zackqrt-creator/Territory-Operating-System (GitHub; formerly named Claude-skills)

Working branch: claude/casetrack-inventory-pwa-9ngunk

Live deploy: Vercel (project name still claude-skills)

Codebase size: ~14,800 lines of TS/TSX across src/, plus 43 SQL migrations

1. What this product is

Territory OS (internal working name; started life as "CaseTrack 2.0") is a mobile-first PWA for a Medacta orthopedic device sales rep to run their territory.

The user is a field rep. Their day is: surgical cases get scheduled at hospitals, each case needs specific implant/instrument trays physically delivered and sterile-processed on time, trays are shared across a territory and constantly moving, surgeons have individual preferences, and loaner sets have return deadlines. Missing a tray means a cancelled surgery.

Medacta's official system is myOPS — it handles billing, credentialing, and the official order of record. Territory OS is explicitly not trying to replace myOPS. It is the rep's personal operating layer on top of it: what's physically where, what's at risk today, what the surgeon actually likes, and what the rep needs to remember.

The three pillars

Inventory — what trays/implants exist, where they physically are, what's moving, what's expiring, what's short.

Case logistics — the surgical calendar, what each case needs, staging/pack lists, readiness, loaner returns.

Notes / second brain — turning field observations into durable, searchable operating knowledge (surgeon preferences, hospital rules, playbooks) and into action items.

Explicitly out of scope by user decision: billing and credentialing UI. myOPS already does those. (The /billing and /compliance routes still exist in code but are deliberately unlinked from navigation.)

2. Tech stack

Layer

Choice

Frontend

React 19 + TypeScript + Vite 8

Styling

TailwindCSS 4 (@tailwindcss/vite)

Routing

react-router-dom 7

Icons

lucide-react (standardized this session; replaced emoji)

Backend

Supabase — Postgres + Row Level Security + magic-link auth

PWA

vite-plugin-pwa

Extras

html5-qrcode (barcode scanning), tesseract.js (OCR of sticker labels)

Hosting

Vercel

Lint

oxlint

Build command: tsc -b && vite build. The build is currently clean (typecheck + production build both pass).

3. Data model (Supabase / Postgres)

All tables are territory-scoped and protected by RLS. The canonical RLS pattern is a SQL function my_territory_id() which reads profiles.territory_id for the current auth user; every policy compares territory_id = my_territory_id(). There is no territory_members table — an earlier design draft assumed one and was corrected.

Tables currently in the schema

Identity / orgterritories, profiles, facilities, surgeons, rep_certifications, rep_time_off, facility_credentials

Inventorycatalog_items (the product master — every implant/instrument SKU, with GTIN), inventory_items (physical on-hand units with lot/expiry/location), movements (inventory transaction log), tracked_assets + asset_movements (individually tracked trays/kits)

Catalog — the 3-layer model (see §4)case_templates (Procedures) → procedure_sets (join) → tote_templates (Sets) → tote_template_items → catalog_items. Also case_template_items and case_item_plans.

Casescases, surgeon_preferences

Collaboration / knowledge

tasks — personal + assigned to-dos; has nullable polymorphic entity_type/entity_id so a task can hang off any record

entity_notes — inline comments on a specific record (a case, an inventory item, a surgeon, a facility, a catalog item, a Set, a Procedure)

pages + page_links — durable wiki-style knowledge pages with [[wikilink]] graph edges

territory_notes + territory_note_links + territory_note_tags + territory_note_tag_assignments — the field-capture note system (see §5)

board_posts + board_comments — team board

qa_questions + qa_answers — Q&A wall

4. The catalog module (3-layer product model)

This is the heart of the inventory side, and the bulk of recent work.

Medacta's myOPS exports packing lists as Excel files. A packing list is a "Set" — a physical tray with a specific list of parts. A surgical Procedure requires several Sets. So:

Procedure  (case_templates)          e.g. "500 GMK SpheriKA Left"
  └─ procedure_sets (join table)
       └─ Set  (tote_templates)      e.g. "GSKAIMPL", "GSTILVE", "500KATRL"
            └─ tote_template_items
                 └─ catalog_items    e.g. individual femoral components, screws, trials

Both case_templates and tote_templates carry a code column matching the myOPS code, plus tote_templates.content_type (implant vs instrument). case_templates.alt_name was added because myOPS is inconsistent about naming (e.g. it calls the same thing both "500 Sphere Left Case" and "500 Sphere KA Left Case").

How data gets loaded

The rep exports packing lists from myOPS and uploads the .xlsx files into the chat. They are parsed (raw XML via zipfile + xml.etree — openpyxl is not installed in the build environment), diffed byte-for-byte against already-loaded Sets to avoid duplicate work, and turned into idempotent SQL migrations using where not exists guards throughout — so re-running a migration or re-uploading the same packing list is always safe.

Procedures loaded so far (9)

500 GMK SpheriKA Right · 500 GMK SpheriKA Left · 500 Sphere KA Left Case · 500 Sphere KA Right Case · 500 Sphere KA TiN Left · 500 Sphere KA TiN Right · GMK Revision Left · GMK Revision Right · GMK Sphere 300 Left Case

Domain notes learned along the way:

"GMK Spherika" (KA) and plain "GMK Sphere" are different product lines with different femoral trial trays (500KATRx vs 500SPTRx) even though they share tibial components. They are kept as separate catalog items.

Many trays are ambidextrous and reused across procedures (PATRES, 500METAL, GEXT, GINSERT…). Only genuinely new Sets get loaded.

Left/Right versions mirror each other almost exactly; synthesized Right-side data was later validated byte-for-byte against real myOPS exports.

The largest tray loaded (REVT, GMK Revision) has 263 line items.

5. The Notes / second-brain system

This went through several design iterations and landed on a deliberate two-layer, one-product model. The stated design goal, verbatim from the user: build it as a Team Memory + Action system, not a note-taking app — "a simple team app that turns field notes into searchable playbooks, reminders, and operating knowledge."

   CAPTURE                 REVIEW                  KNOWLEDGE
   /notes         →     /notes/review      →      /pages
   territory_notes      triage queue              pages + page_links
   (fast, messy,        (promote / archive)       (durable, curated,
    private default)                               wikilinked)
                              │
                              └──→ tasks (entity_type = 'note')

Layer 1 — Capture (territory_notes, route /notes)Fast mobile capture with 8 kinds, each with its own lucide icon:

Kind

Label

general

Quick capture

case

Case debrief

surgeon

Surgeon preference

hospital

Hospital rule

inventory

Inventory issue

replenishment

Replenishment note

logistics

Logistics note

playbook

Playbook entry

Notes are private by default, full-text searchable (tsvector generated column + pg_trgm trigram indexes), taggable, pinnable, archivable, and linkable to any entity — cases, surgeons, facilities, catalog items, Sets, and tasks — via territory_note_links.

Layer 2 — Knowledge (pages / page_links, route /pages)Durable curated pages, reached either by promoting a raw note or by following [[wikilinks]]. promoteNoteToPage() creates a page from a note's title/body/AI summary and stamps the note second_brain_status = 'synced'.

The bridge — review queue (/notes/review)Backed by the territory_second_brain_queue view. Raw notes get triaged: promote into knowledge, spawn a task, or archive.

Deliberate boundaries:

entity_notes stays inline record comments only — it does not compete with /notes.

Action items reuse the existing tasks table (entity_type='note'); no new task table was created.

Obsidian sync is optional and behind the scenes. The user does keep an Obsidian vault, but the user-facing product is Territory OS Notes — Obsidian holds only the build blueprint and personal second-brain notes, never live app data.

ai_summary / ai_action_items / ai_entities columns exist and render in the UI, but nothing populates them yet — triage is manual for now. This is the most obvious place an AI pipeline plugs in.

6. Application surface (routes)

Bottom nav (mobile-first, 5 primary + overflow):Home · Cases · Inventory · Tasks · Notes · More

Route

Page

Notes

/

Home

Field-ops command center

/cases

Calendar

Case calendar (revamp pending — see §9)

/cases/new

AddCase



/inventory

Inventory

Tabs: On-hand · Catalog · Sets · Movements

/tasks

Tasks



/notes

Notes

Capture feed

/notes/review

SecondBrainQueue

Triage / promote

/notes/:id

NoteDetail

Edit, link entities, spawn tasks

/pages, /pages/:id

Knowledge, NotePage

Durable knowledge base

/runsheet

RunSheet

In "More"

/staging

StagingReport

In "More"

/pack-list

PackList

In "More"

/sets

Sets

In "More"

/loaners

LoanerReturns

In "More"

/readiness

Readiness

In "More"

/activity

ActivityFeed

In "More"

/surgeons

Surgeons

In "More"

/team

TeamBoard

In "More"

/qa

QaWall

In "More"

/scan

Scan

Barcode + OCR sticker capture

/billing, /compliance

Billing, Compliance

Exist but unlinked — myOPS owns these

/wiki, /wiki/:id

→ redirect

Legacy, redirects to /pages

Home — the command center

Rebuilt this session from a generic dashboard into an ops screen, in this order:

Add case (primary action)

Needs attention — reserve alerts, expiring lots, at-risk cases tomorrow, urgent loaner returns, urgent tasks

Schedule — Today / Tomorrow grid

Staging

Inventory pulse

Tasks & team

Recent activity

Billing and credentials sections were removed from Home per explicit instruction.

7. Where the project stands right now

Done and pushed

Catalog: migrations 026–041, 9 procedures fully loaded from real myOPS exports.

Notes/second brain: migrations 042–043, plus all UI (Notes.tsx, NoteDetail.tsx, SecondBrainQueue.tsx, QuickCaptureNote.tsx, noteKinds.ts) and the full API layer in src/lib/api.ts.

Supabase live database has been inspected via MCP: catalog/notes tables, views, indexes, and logistics/playbook note kinds are present. Migration 044_notes_views_security_invoker was applied live to make the notes views obey underlying RLS.

UI cleanup sprint: lucide-react installed, 6-item bottom nav with overflow sheet, command-center Home, tabbed Inventory, billing/credentials removed, /wiki → /pages migration with redirects.

docs/build.md — a running build log for the user's Obsidian vault.

Previous Claude work was committed on claude/casetrack-inventory-pwa-9ngunk; current Codex changes are local until GitHub write access is available.

Not yet done — the actual current blockers

The new UI still needs live click-testing against real data. It is verified by schema inspection plus tsc typecheck + vite build + dev-server transform, but the app flows still need a real browser pass while logged in.

Repo write access from the GitHub connector is currently blocked. The connector can read the repo, but GitHub returned 403 Resource not accessible by integration when trying to create migration 044. Local checkout works.

The environmental constraint that shaped everything

For most of this project, the AI assistant's build sandbox could not reach Supabase over the network — the outbound proxy blocked Supabase's domains (both the DB pooler and api.supabase.com returned 403), direct Postgres ports were blocked, and the direct DB host is IPv6-only while the sandbox is IPv4. This is a network-policy limitation of the build environment, not a Supabase misconfiguration — resetting the DB password and minting a personal access token did not help.

Consequences that explain a lot of the workflow:

Every schema change is delivered as copy-paste SQL that the user runs manually in the Supabase SQL editor.

No live queries, no live click-testing, no data verification from the assistant's side.

Migrations are written defensively (idempotent, if not exists everywhere) because they can't be tested before the user runs them.

Status update: Supabase MCP tooling is now available in the current session. Live schema inspection and 044_notes_views_security_invoker were successfully run against Zack CaseTrack (tylytbjxizxukefpplcw).

8. Design decisions worth knowing (and their rationale)

Decision

Why

3-layer catalog rather than flat item lists

Mirrors physical reality: a procedure needs trays, a tray contains parts. Lets the app answer "what do I physically need for Dr. X's Thursday case?"

All catalog inserts idempotent

Migrations are run by hand by a non-engineer; re-runs must be harmless.

Notes split into capture vs. knowledge

Field capture must be fast and messy; knowledge must be curated and trustworthy. One table can't be both without the product feeling like a junk drawer.

Reuse tasks for note action items

Avoids a parallel to-do system the rep would have to check separately.

entity_notes kept strictly inline

Prevents four competing note surfaces (/notes, /wiki, entity_notes, territory_notes) confusing users.

Billing/credentials removed

myOPS is the system of record; duplicating it creates reconciliation risk and screen clutter.

Obsidian relegated to build-blueprint only

App data belongs in Supabase where RLS and multi-user access work. Obsidian is a personal artifact, not a backend.

lucide-react over emoji

Professional appearance; consistent sizing/weight; tree-shaken per-icon.

my_territory_id() for all RLS

One pattern everywhere means new tables are safe by default.

9. Open items / roadmap

Immediate

Confirm live Supabase has catalog + notes schema through 043.

Apply 044_notes_views_security_invoker so note feed views obey RLS.

Live click-through: Home command center, Notes capture → review → promote, Inventory tabs (esp. Catalog/Sets showing real myOPS data), the More sheet, /wiki→/pages redirects.

Scoped but deliberately deferred

Calendar revamp (the biggest pending piece). Requested behavior: default to month view + personal calendar; tap a day to open a time-slot picker rather than a form; ability to label what a time slot is for; attach another user to a case for coverage; "Add case" must require a time; selection state should reset after adding; subscribe to the myOPS calendar feed.

Surgeon-specific pack customization. Today surgeon_preferences can only swap whole Sets. Real surgeons want extra items added to their tray — including items Medacta doesn't even sell. Needs a design for per-surgeon item overrides and free-text/non-catalog items.

Second-brain AI pipeline. Columns and status flow exist; nothing writes them. Natural fit: auto-summarize notes, extract action items into tasks, auto-detect entity links, suggest promotions to the review queue.

Remaining procedures to load (TiN Right for the 300 line, plus whatever else myOPS lists). Loading is slow because packing lists must be uploaded a few files at a time.

Optional/behind-the-scenes Obsidian export of knowledge pages.

Known friction worth solving

Bulk catalog ingestion is the slowest part of the project. A direct myOPS integration, or a bulk upload path in the app itself, would remove the manual Excel→chat→SQL loop entirely.

10. Good questions to ask about this project

If you're reviewing this and looking for where to add value, these are the genuinely unsettled areas:

Is the two-layer notes model (capture → promote → knowledge) the right shape, or does the promotion step add friction a busy field rep won't pay?

What's the right design for surgeon-specific tray customization that includes non-catalog items without corrupting the catalog master data?

How should the calendar handle multi-rep coverage and an external (myOPS) feed it doesn't own?

Where should AI actually sit in this product — background enrichment of notes, or a foreground assistant that answers "am I ready for Thursday?"

Is there a faster path from myOPS packing lists to the catalog than manual export → parse → migration?

Offline behavior: it's a PWA used inside hospitals where signal is bad. Offline capture/queueing has not been designed.
