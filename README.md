# CaseTrack 2.0

Mobile-first PWA for tracking territory inventory and case logistics: loaner kits, instrument
trays, implants, and consumables moving between storage facilities, surgery centers, and your
trunk. Built with React + Vite + Supabase.

**What's in this build (v1):**
- Fast manual case entry (under 10 seconds) with smart defaults
- Paste-import: paste rows copied from myOPS, parse them, preview, and bulk-create cases
- Live inventory list, filterable by location/category, searchable by name/lot
- Camera barcode/QR scanning (check items in/out) with a 3-tap manual fallback
- Every inventory move writes an immutable audit-log row (`movements`)
- Supabase auth (email magic link), multi-tenant schema (`territory_id` everywhere)
- **Surgery calendar**, Wednesday-anchored, with a Week/Month toggle. The month grid shows a
  readiness-colored dot per day (green = all cases ready, red = something needs attention) plus a
  case count on multi-case days — a one-glance view of the whole month's load. Tapping any day
  drops into that day's case cards. Each case is matched to its case template
  (TKA/THA/Partial Knee/Partial Hip) and checked against live inventory at that case's facility.
  Gaps show red, right down to which other facility has the item — tapping a case opens the full
  checklist, and a gap has a one-tap "Move to [facility]" action wired straight into the
  inventory move flow. Case cards carry the covering rep's initials (explicit assignment, else
  whoever created the case), and an Everyone/Mine toggle filters the whole calendar — dots,
  counts, and cards — to just your cases. Days with 3+ cases get an amber count, and heavy days
  show a load warning above the case list.
- **Day-of run sheet** (`/runsheet`, also the "Today" chip on Home) — the selected day as a
  chronological timeline: start time (TBA last), case, facility, surgeon, rep initials, readiness
  badge, and case notes, with plain-language load warnings up top ("Heavy day: 3 cases",
  "Cases at 2 facilities — plan travel time", "Two cases start at the same time at X and Y —
  someone needs coverage", "1 case still TBA"). Tapping a case opens the full readiness
  checklist; a "Staging →" button jumps to the staging report for the same day.
- **Staging report** (`/staging`, the killer feature) — pick a day (defaults to tomorrow) and it
  rolls up every case that day into one run sheet: a haul list grouped by "from facility → to
  facility" with a one-tap move per item, a count of what's already staged, anything required
  that isn't in inventory anywhere, and every loaner kit due back at corporate within the week
  (with a one-tap "Ship" action). Home shows a live summary card whenever tomorrow has cases.
- **Post-case quick log** — a "Log case" button on the case checklist. Tap what was actually
  used (implants and consumables decrement inventory; loaner kits get a "used, start the return
  clock" toggle instead — see below), adjust quantities with +/− if a case ran long on cement or
  needed an extra unit, and submitting marks the case complete and shows a replenishment list of
  exactly what to restock. Decrementing consumes the earliest-expiring lot first (FIFO) when a
  facility is holding more than one lot of the same implant.
- **Loaner return countdown** (`/loaners`) — your 48-hour-after-the-case rule, tracked
  automatically: logging a case starts the clock on its loaner kit (deadline = surgery date + 2
  days), and this view lists every loaner currently on the clock, most-urgent-first. When a
  loaner nearing its deadline is needed again by a case in the next 3 days, it gets a logistics
  suggestion — extend this one, and if a spare unit of the same kit exists elsewhere and isn't
  itself needed soon, ship that one back instead so you stay compliant without leaving the
  upcoming case short. One-tap **Extend** (date + reason, pre-filled from the suggestion) or
  **Ship to corporate**, which automatically clears the return clock once it's actually back.
- **Activity feed** (`/activity`) — every move, case log, and extension across the team as plain
  sentences ("Zack moved GMK Total Knee Loaner Kit from Storage Facility A to Vehicle · 7:42 AM"),
  grouped by day, newest first. Nothing new to track — it just reads the `movements` audit log
  that every other feature already writes to. Home shows the 3 most recent as a preview card.
- **Surgeon preference profiles + pack list** (`/pack-list`) — instead of a generic per-surgery
  checklist, each surgeon can have a preference profile (instrument set, implant product line,
  alignment technique) pointing at tote templates you define once (e.g. "KA One Complete Tote" —
  every femur/tibia/insert size, one of each, plus Motopat and fixation hardware). Pick a day and
  the pack list groups that day's cases by surgeon + side, multiplies the whole tote by however
  many same-side cases need it that day (since an opened implant can't go back on the shelf — 3
  same-side cases means 3 complete size-runs), and checks every size against on-hand inventory
  with lot numbers, grouped into **Layer 1/2/3** matching how you physically load a tote.
  Instrument trays get a separate, non-blocking advisory instead of a hard requirement, since
  they're normally resterilized and reused between cases. A tote only needs to be defined for one
  side — the other side resolves automatically once matching catalog items exist for it. See "A
  note on the pack list" below for what's real (from your photos) vs. still open.
- **Reserve-facility alerts** — flag a facility (e.g. a rarely-touched backup storage location)
  as `alert_on_withdrawal`, and any time something leaves it, it shows up in red across Home and
  the Activity feed until someone taps "Mark replenished." There's no push/SMS infrastructure
  yet, so this is in-app visibility, not a phone notification — see the note below.
- **Individually tracked instrument trays** — the KA One instrument set is now modeled as its
  3 component trays (Cutting & Alignment, Sizing & Spacer Block, Drill & Cut Block) instead of
  one combined unit, since loaners for a single tray sometimes come and go on their own. The pack
  list shows on-hand count and a ✅/⚠️/❌ status per tray, plus a "complete sets" number
  (the minimum across all three) so you can see at a glance if the set is actually whole.
- **Surgeons page** (`/surgeons`) — add a surgeon, and write free-text notes on what they like,
  what to expect, anything worth knowing before a case (separate from the structured tote
  preferences that drive the pack list — this is just for the team). Dr. Sidhu and Dr. Neophil
  (Lodi Memorial) are seeded; their notes are empty/placeholder until you fill them in.
- **Hip catalog support + on-the-fly device creation** — the catalog now has a `joint`
  (Knee/Hip/Other) and `device_type` (Femoral Stem, Acetabular Cup, Bone Cement, etc.) so hip
  devices organize separately from knee ones. Add Item has a Knee/Hip/Other toggle that filters
  the catalog search to match, and if a device isn't in the catalog yet, "Add as a new catalog
  item" creates it inline (name, device type, product line, side, size, cement type) right from
  the add-item flow — no migration needed. See "A note on the Hips catalog" below for exactly
  what's seeded vs. what you're adding tomorrow.
- **Photo on inventory items** — Add Item now has an optional camera/photo field. Attach a photo
  of the physical device when you scan it in; it uploads to Supabase Storage and shows as a
  thumbnail. Useful for the team to visually confirm a match without asking you, especially
  while the hip catalog is still filling in.
- **CRM layer** — CaseTrack is now a one-place CRM on top of the inventory engine:
  - **Case readiness score** — every case on the Calendar carries a red/yellow/green badge
    computed from four checks: required items (existing template diff), tray sterilization,
    the covering rep's certifications, and inbound loaner delivery timing. The case detail
    sheet shows the full breakdown. Honesty rule: a check with no data behind it shows
    "not tracked" and never fakes a green or forces a false red — the score sharpens as you
    log certs/sterilization/delivery, and works on day one from item availability alone.
  - **Self-filling preference cards** — creating a case for a surgeon + procedure auto-suggests
    the item list from what was *actually logged as used* in their past cases of the same type
    (toggle between "Usual" = most frequent across history, and "Last case" = copy most recent).
    Accept, uncheck, or add items before saving; the accepted plan shows on the case detail.
  - **Chase-the-money pipeline** (`/billing`) — every completed case grouped by billing stage
    (awaiting PO → PO received → invoiced → paid), tap to advance. The myOPS CSV import now
    captures `purchase_order_no`/`posted_invoice_no` so imported cases land pre-staged.
  - **Q&A wall** (`/qa`) — anyone asks, anyone answers, question author marks the best answer.
    Pin a question to a product, surgeon, or procedure and it automatically surfaces on
    matching case screens.
  - **Surgeon profiles** — the Surgeons page now shows case volume, last-90-days trend vs the
    prior 90, knee/hip mix, and recent case notes, derived entirely from existing case records.
  - **Compliance + door-check** (`/compliance`) — track rep certifications and facility
    credentials (RepTrax/Symplr expiries). The door-check cross-references credential expiry
    against your scheduled cases at that facility and alerts on Home *before* you get turned
    away at the door.
  - **Use-these-lots-first** — Home suggests which implants expiring within 60 days fit which
    upcoming case (same joint/side, case before expiry). Advisory, never blocking.
  - **Personal task boards** (`/tasks`) — Trello-style for each teammate: To do → In progress →
    Done, with notes and due dates. **Private by default** — a task is invisible to everyone but
    its owner unless explicitly shared with chosen teammates, and that's enforced by row-level
    security in the database, not just hidden in the UI. **Duplicate** any task with a new date
    so recurring work (weekly counts, restock runs) never gets retyped. Overdue tasks flag red.
  - **Universal notes** — an "+ Add note" button on pretty much everything: case detail,
    inventory item edit, loaner tote detail, and surgeon cards all carry a timestamped,
    authored note thread. Anyone on the team can add a note any time; authors can edit
    (marked "edited") or delete their own. One shared system (`entity_notes`), so a note
    follows its record everywhere. Personal tasks keep their own private notes field
    (this thread is team-visible by design).
  - **Regional manager locations + in-app location editing** — "Matt Inventory (RM)" and
    "Karl Inventory (RM)" are seeded as inventory locations (migration 014), and the
    Compliance page has a **Locations** card where anyone on the team can rename any
    location or set its address in-app — so once you learn where an RM's stock actually
    lives, fix it in two taps, no database access needed.
  - Run `011_crm_foundation.sql` then `012_personal_tasks.sql` then `013_entity_notes.sql`
    then `014_manager_locations.sql` then `015_wall_categories.sql`.
  - **Global notes search** (`/notes`, Notes chip on Home) — every note the team has written,
    across cases, surgeons, facilities, and items, in one searchable place with filter chips.
    Type "cement" or "door code" and find it, with what it's attached to.
  - **Team wall channels + unread** — every post carries a topic (#general #inventory #cases
    #schedule) picked in the composer, with filter chips on the wall. The Home card shows
    "N new posts since your last visit" (tracked per device). (after 010) to enable all of it.
- **Team board** (`/team`) — a shared, territory-wide space for the whole crew: post notes and
  hand-offs, turn any post into a **to-do assigned to a teammate**, **@-tag** whoever needs to see
  it, and reply in a thread. Filters for All / To-dos / Assigned to me / Mentions me. Home shows a
  card with how many open to-dos are assigned to you. (In-app only — no push/SMS yet.)
- **Scan a label to auto-fill** — adding a consignment item, tap "📷 Scan label to auto-fill,"
  snap the printed label, and it reads the REF, size, side, cement, lot, and expiration **on the
  phone** (no server, no per-scan cost, photo never leaves the device). Because the catalog now
  carries the real REF numbers, an exact REF match links the item and takes size/side from the
  catalog — not from fuzzy text — so it can't silently mislabel. Everything is a pre-fill you
  confirm; if the label won't read, the photo still attaches and you type it in. (First scan
  fetches the recognizer from a CDN, so it needs a connection once, then caches.)
- **Loaner tote click-through, acquisition badges & expiry flags** — every inventory row shows a
  Consignment/Loaner badge; tapping a **loaner tote** opens its contents (the `SPKAEFFR08` →
  "Ins-Spherika Efficiency Right" → itemized units view). Items nearing or past their expiration
  show amber/red right in the list, and Home shows a safety alert if anything in stock is expired
  or expiring within 30 days (you never want an expired device reaching the field).
- **Edit & delete inventory** — tap an item → "Edit details / delete" to fix a mistyped lot,
  expiration, quantity, location, or cement, or remove a wrong entry (with a confirm). The
  catalog-linked name is locked so identity stays trustworthy. The bulk-entry safety net.
- **"Am I ready?" inventory readiness** (`/readiness`, headline feature) — pick a day and it
  answers the three questions that matter: **total inventory, where it is, and do I have enough
  for the day.** It counts every size you'd bring (a knee case needs one of every size on its
  side, since the surgeon sizes intraop), combines **consignment + loaner** stock into one total
  per size, and grades each size: ✅ ready, ⚠️ covered only if you dip into **Lodi reserve**
  (flagged to replenish), or ❌ short. Shortfalls come with the smartest way to cover them —
  haul from Elk Grove/Adventist first, order a loaner, and Lodi as the true last resort. A total
  inventory summary (by location, reserve flagged) sits at the bottom and shows even on days with
  no cases. Surfaced big on Home.
- **Consignment vs. loaner tracking** — inventory now distinguishes owned **consignment** stock
  (tracked by name/size/side, with a Cemented/Cementless toggle on femurs) from borrowed
  **loaner totes**. A loaner tote is logged by its outer code (e.g. `SPKAEFFR08`) plus a plain
  inner name (e.g. "Ins-Spherika Efficiency Right"); its contents are itemized so they roll into
  the same per-size/side totals as consignment. A one-tap "quick fill a full set" adds one of
  every size the way a loaner tote actually arrives, so a 25-piece insert tote is a couple taps.
- **myOPS CSV import** — on Add Case, upload the CSV exported from the myOPS case table
  (File > Export on your MacBook) and it imports everything in one shot: date, time (respecting
  TBA), knee/hip/instrument, side, status ("done" cases come in as completed; canceled ones are
  skipped and counted), plus a notes line per case carrying the alignment (e.g. KINEMATIC), the
  loaner ship/return window from the smart-ordering columns, the myOPS classification codes
  (MKGS/MKGR/ABMS), and any patient comment (implant-size context for revisions). **Patient
  names and identifiers in the file are deliberately never imported** — case logistics don't
  need PHI in this database. Surgeons come through myOPS as numeric IDs, not names, so imported
  cases aren't linked to a surgeon automatically; set that per case or rely on quick-add. The
  same preview/dedupe screen as paste-import runs before anything is saved, and re-importing an
  overlapping export is safe (existing case IDs are skipped).
- **Professional visual refresh** — the whole app now uses the Inter typeface (bundled, so it
  works offline), a retuned navy/blue palette with noticeably crisper text contrast, a subtle
  brand glow behind every screen, an active-tab pill on the bottom nav, gradient primary buttons,
  and consistent focus rings and press feedback. No layout or flow changed — everything is where
  it was, it just reads sharper.
- **Catalog-linked inventory** — adding an inventory item (via the Inventory page's "+ Add" or
  the Scan screen's "not found" fallback) now has an optional "Match catalog item" search field.
  Matching an existing catalog entry pre-fills the name/category and links the item's exact size,
  which is what lets the pack list match it correctly. Leaving it unmatched still works for
  generic items — it just won't be size-aware on the pack list.

Every feature from the original brief is now built, plus surgeon preference profiles and the
pack list. See "What's next" for what's still open.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**.
2. Pick any name/region/password (save the DB password somewhere, you likely won't need it again).
3. Wait ~2 minutes for it to finish provisioning.

## 2. Run the database schema

Migrations live in `supabase/migrations/`, numbered in order. Run each one, in order, the same
way:

1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/migrations/001_initial_schema.sql` in this repo, copy the whole file, paste it
   into the editor, click **Run**. You should see "Success. No rows returned."
   - This creates all the tables, sets up row-level security so each territory only sees its
     own data, and seeds one territory ("Sacramento") with your 4 facilities (Storage Facility
     A/B, Vehicle, Corporate) and the 4 case templates (TKA, THA, Partial Knee, Partial Hip).
3. Repeat for each remaining numbered file, in order:
   - `002_calendar_readiness.sql` — hip cases + total/partial distinction.
   - `003_loaner_extensions.sql` — extension date/reason columns.
   - `004_surgeon_bom_and_totes.sql` — catalog items, surgeons, surgeon preferences, tote
     templates, `cases.surgeon_id`, `movements.tracking_number`, and the reserve-facility alert
     column on `facilities`.
   - `005_seed_surgeon_bom_example.sql` — example starter data (Dr. Sidhu, KA One totes). Read
     the comment block at the top of that file before you rely on it for a real case — it lists
     exactly what's confirmed vs. placeholder.
   - `006_pack_layers_and_real_catalog.sql` — corrects the placeholder product names to the real
     brands (confirmed from your photos), adds Right-side catalog items, expands tibial inserts
     to real size × thickness combinations, and adds the Layer 1/2/3 packing order. **Must run
     after 005**, since it edits what 005 created.
   - `007_individual_trays_and_neophil.sql` — splits the single "KA One Instrument Tray" line
     into its 3 component trays (tracked individually), and adds Dr. Neophil (Lodi Memorial) as a
     surgeon. **Must run after 005/006.** The 3 tray names are my best inference from your
     photos, not official names — rename them in Supabase's Table Editor → `catalog_items`
     whenever convenient, nothing else depends on the exact wording.
   - `008_hip_catalog_and_photos.sql` — adds `joint` and `device_type` to `catalog_items` so hip
     devices can be organized separately from knee ones, adds `photo_url` to `inventory_items`,
     and creates the `item-photos` Storage bucket. No hip products are seeded — see "A note on
     the Hips catalog" below.
   - `010_team_board.sql` — the team communication board (posts, to-dos, comments), territory-
     scoped RLS. Independent of the others; run any time after 001.
   - `009_inventory_acquisition_and_readiness.sql` — the consignment-vs-loaner tracking model
     (`acquisition_type`, loaner-tote container columns, per-unit `cement_type`), replaces the
     demo facilities with your real ones (Elk Grove, Adventist Memorial Hospital, Lodi Reserve,
     Vehicle, Corporate) with a `sourcing_priority`, and backfills the real tibial-insert item
     numbers from the confirmed REF pattern. See "A note on inventory & readiness" below. **Run
     after 006/008.**
   - Already ran earlier ones? Just run whichever new numbered file(s) you haven't yet — you
     don't need to redo ones you already ran.
4. Whenever this repo gets an update with a new numbered file in `supabase/migrations/`, run
   just that new file the same way. All migrations are safe to re-run if you're ever unsure
   whether one went through.

## 3. Turn on email magic-link auth

Magic link is Supabase's default and needs no extra setup, but double check:

1. **Authentication** → **Providers** → confirm **Email** is enabled.
2. **Authentication** → **URL Configuration** → set **Site URL** to your Vercel URL once you have
   it (step 6). Until then `http://localhost:5173` is fine for local testing.

## 4. Get your API keys

1. **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon public** key (not the `service_role` key — never put
   that one in a frontend app).

## 5. Run it locally

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and paste in your values:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Then:

```bash
npm run dev
```

Open the printed `localhost` URL. Sign in with your email — Supabase emails you a magic link
(check spam if it doesn't show up in ~30 seconds). Clicking it logs you in and creates your
profile automatically, attached to the seeded "Sacramento" territory.

## 6. Deploy to Vercel

1. Push this repo to GitHub if it isn't already (this branch is already pushed for you — see the
   PR/branch this was delivered on).
2. In Vercel: **Add New** → **Project** → import this repo.
3. Framework preset: **Vite** (Vercel should detect it automatically).
4. Under **Environment Variables**, add the same two variables from your `.env.local`:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Deploy. Once it's live, copy the `https://your-app.vercel.app` URL and set it as the
   **Site URL** in Supabase (step 3) so magic-link redirects work in production.

## 7. Put it on your phone

1. Open your Vercel URL in **Safari** on your iPhone (must be Safari, not Chrome, for iOS
   install to work).
2. Tap the **Share** icon → **Add to Home Screen**.
3. Sign in once with your email; you'll stay signed in after that.

---

## Adding your team (reps 2-5)

Each teammate just signs in with their own email at the same URL — the "new user" trigger in
the schema automatically drops them into the same territory you seeded. If you want someone to
have `lead` instead of `rep` permissions later, update their `role` column in the Supabase
**Table Editor** → `profiles` table (both roles currently see/do the same things — the role
column is there for when we build lead-only features).

## Barcoding items

The scan screen reads whatever `barcode_value` you save on an inventory item — it works with
existing corporate QR/barcodes on loaner kits (scan the item once, it'll say "not found," which
opens a form to name and save it with that code attached) or you can generate your own QR codes
for trays that don't have one and tape them on.

## What's next

**Before the pack list is trustworthy for a real case**, I still need from you:

1. Which facility is Lodi (or its real name if it's not one of the 4 seeded ones yet) — for now,
   flip `alert_on_withdrawal` to `true` on that row in Supabase's **Table Editor** →
   `facilities`. I can build an in-app toggle for this later if you want one.
2. ~~Whether the KA One instrument set is one combined unit or separate trays~~ — done: it's now
   modeled as 3 individually tracked trays (see above). The 3 tray names are my inference from
   your photos though — correct them whenever convenient (see migration 007's note).
3. Clarification on the two "Partial Small Tote" descriptions and both Revision totes from your
   very first message — still not seeded, the phrasing had ambiguity I didn't want to guess on
   (see the comment block at the top of `005_seed_surgeon_bom_example.sql`).
4. Whether the "Inserts" in the tote are really the same GMK Sphere Primary E-Cross line as the
   specific loaner items from your live example (SPKAEFFL, GSLVEMIC01, etc.) — their size codes
   ("Micro S1", "17-20") still don't obviously map onto the size/thickness catalog now seeded, so
   I've kept them separate rather than guess.
5. Real item numbers for inserts and Moto PFJ patella components, whenever convenient — femur and
   tibial tray REFs are now populated (derived from the clean pattern on your labels), but I
   didn't trust myself to derive insert/patella codes the same way. Not required for the pack
   list to work either way (matching is by name/size).
6. Dr. Sidhu and Dr. Neophil's actual preference context — the **Surgeons page** (`/surgeons`)
   is built and ready for it, both are seeded with empty/placeholder notes. Add hip-implant
   photos and the facility-audit data whenever you get to it too.

**Once that's settled**, the natural next steps for the pack-batching workflow you described:

7. **GS1 barcode parsing** — decode lot/expiration/GTIN straight from a scan instead of typing
   them, once you're ready. Buildable now, independent of the harder scanning question below.
8. **Rapid sequential scanning** for pack verification — keep the camera open and scan through a
   tote item-by-item, checking each one off the pack list as you go. This is the realistic v1 of
   "batch scan a tote"; see the note below on why true multi-item-per-frame video scanning is a
   bigger, likely-paid undertaking I'd want to scope separately.
9. A small in-app screen for adding/editing surgeon preferences and tote templates yourself,
   instead of asking me to write a migration each time (the Surgeons page now covers notes, but
   not the structured tote/preference wiring — that's still migration-only).

**Smaller items still open:**

10. **Offline queueing** for scans made without signal (explicitly called a "nice to have,
    don't block v1" in the original brief).
11. The loaner extend/swap suggestion doesn't check whether a "spare" unit is itself needed for
    something else soon — fine at your current scale, worth tightening once you have multiple
    reps moving kits independently.
12. Give Staging, Loaners, Activity, Pack, and Surgeons their own bottom-nav visibility tuning if
    the current 6 tabs (plus a Surgeons link off the Pack page) ever feels cramped on your phone —
    tell me if it does.

## Project structure

```
supabase/migrations/      # run these in order in the Supabase SQL editor
src/lib/supabase.ts       # Supabase client
src/lib/api.ts            # all database reads/writes: logCaseUsage, markLoanerUsed, extendLoanerReturn, etc.
src/lib/types.ts          # TypeScript types matching the schema
src/lib/readiness.ts      # matches a case to its template, diffs required items against inventory
src/lib/staging.ts        # rolls up a day's cases into the haul list + loaner ship list
src/lib/loaners.ts        # loaner return countdown + extend/swap suggestion engine
src/lib/activity.ts       # turns movements rows into plain-language feed sentences
src/lib/packlist.ts       # surgeon-preference-driven pack list / demand aggregation engine
src/lib/runsheet.ts       # day ordering, load warnings, rep initials/attribution
src/hooks/useAuth.tsx     # session + profile state
src/pages/Calendar.tsx    # Week + month calendar views (route: /cases)
src/pages/RunSheet.tsx    # day-of chronological run sheet (route: /runsheet)
src/pages/StagingReport.tsx  # the staging report (route: /staging)
src/pages/LoanerReturns.tsx  # the loaner return countdown (route: /loaners)
src/pages/ActivityFeed.tsx   # the team activity feed (route: /activity)
src/pages/PackList.tsx    # the pack list (route: /pack-list)
src/pages/Surgeons.tsx    # surgeon list + free-text preference notes (route: /surgeons)
src/pages/                # one file per screen
src/components/           # shared bottom sheets (move/add item, readiness checklist, quick log, extend), nav
src/utils/parsePaste.ts   # myOPS paste-import parser
src/utils/dates.ts        # next-Wednesday default, week math, countdown math
```

## A note on "every Tuesday"

The brief describes this as something that generates itself every Tuesday. There's no
background server here to run something on a schedule — it's a static site, so the report is
computed live, on demand, whenever you open `/staging`. It defaults to **tomorrow**, so opening
it on a Tuesday naturally shows Wednesday's run sheet (and on a Thursday, Friday's). You can
also page backward/forward a day at a time to preview or revisit any day. If you want an actual
Tuesday-morning nudge on your phone, that would mean adding push notifications — a bigger
addition; say the word if you want it.

## A note on hip cases and "total vs. partial"

Your analyzed myOPS export only had `KNEE`/`INSTRUMENT` values, so paste-import still only
recognizes those two — that's what your actual clipboard data will contain. Quick-add now also
has a **Hip** button and a **Total/Partial** toggle (shown for knee and hip, not instrument),
since you do THA and partial cases too; this is what the readiness checklist uses to pick the
right template. Paste-imported cases default to total, since myOPS's export doesn't distinguish
partial in what you pulled — edit a case in Supabase's **Table Editor** → `cases` → `variant`
column if one of the pasted-in cases was actually a partial.

## A note on post-case logging

There's no separate "reorder" table — the replenishment list is just a plain-language summary
of exactly what you tapped as used, shown once, right after logging. If you need to see it
again later, the used quantities are in the `movements` table (search by case or item) since
each decrement writes an audit row there too — note that its `from_location`/`to_location` are
both set to the case's facility for these, since nothing physically moved; only the quantity did.
Quick-logging a case doesn't physically move the loaner kit or instrument tray anywhere — it
just starts the loaner's return clock (see below). Getting it back to a storage facility or
shipping it to corporate is still a manual move (or the staging report/loaner countdown will
prompt you).

## A note on the 48-hour loaner rule

The return clock starts the moment you quick-log a case: deadline = surgery date + 2 days. This
is **day-level**, not hour-level — a 7:30am Tuesday case and a 4pm Tuesday case both show a
deadline of Thursday, not two different times on Thursday. That matches how the rest of the app
already tracks dates (Calendar, Staging Report), and keeps the UI to "due in 2 days" instead of
needing exact clock times everywhere. If you need hour-level precision later, this is a one-file
change in `src/lib/api.ts` (`markLoanerUsed`).

The extend/swap suggestion only looks 3 days ahead and only checks whether *some other unit* of
the same kit name exists in the field — it doesn't check whether that other unit is itself
needed for a different upcoming case. With a small territory-scale inventory this is unlikely to
bite, but sanity-check the suggestion before shipping the "spare" back, especially once you have
multiple reps moving kits around independently.

## A note on the pack list

**How matching works**: a case links to a surgeon via `cases.surgeon_id` (the Surgeon field on
Add Case now autocompletes against existing surgeons and creates a new one automatically if you
type a name that doesn't match — no separate "add surgeon" step). The pack list groups a day's
knee/hip cases by surgeon + side + surgery type, looks up that surgeon's preference for that
surgery type, and expands their instrument + implant tote templates into required quantities.
Cases without a surgeon on file, or a surgeon without a preference profile yet, show up as an
"unmapped" group with a note instead of guessing — you'd fall back to the standard checklist on
Calendar for those.

**Implants vs. instruments**: this is the ratio you described — implants are a hard requirement
(N same-side cases needs N complete size-runs, since an opened implant can't go back on the
shelf), instrument trays are a soft, non-blocking advisory using "~1 tray covers about 2 same-day
cases" as the starting ratio (matching your "5 cases → 3 trays, 4 cases → 2 trays" examples).
That ratio lives on the tote template (`advisory_cases_per_unit`) so it can be tuned per
instrument set rather than being one global number. A tote can also be marked `reusable: false`
for single-use instruments (like the Spherika Efficiency plastic sets) — those get the same hard
per-case requirement as implants instead of the soft advisory.

**Sizing without a separate "Right tote"**: tote templates only need to be built once. Each line
item is a specific catalog item (e.g. "GMK Spherika Femoral Component, Left, size 2+"); when a
case's side doesn't match, the engine looks for the same product line/category/size on the other
side and uses that instead. Right-side catalog items now exist (from your photos), so Right-side
cases already resolve correctly — verified end-to-end with mock data.

**Layers**: each tote line item can carry a `pack_layer` (1, 2, 3...) and the pack list groups
and orders the checklist by it, matching how you actually load a tote — Layer 1 (femurs + tibial
trays), Layer 2 (inserts), Layer 3 (size-7 femur, Moto PFJ, fixation hardware) for the KA One
Complete Tote, based on your photos. Items without a layer sort to the bottom under "Other."

**Inserts carry real size × thickness combinations**, not just "one per size" — your photos
showed multiple thicknesses (10-20mm) stocked per size, so the catalog now has that full grid for
both sides (42 combinations: 6 sizes × 7 thicknesses). Combinations you don't actually stock just
show 0 on hand, which is the correct, honest signal rather than silently excluding a real one.

**On-hand quantities are territory-wide**, not filtered to the case's facility — the question the
pack list answers is "do I have enough of this size anywhere," not "is it already at the right
building" (that's what the Staging Report's haul list is for, separately).

**Instrument trays are tracked individually, not as one combined unit** — the KA One instrument
set shows a status line per tray (❌ 0 on hand / ⚠️ short of the recommended count / ✅ enough),
plus a "complete sets" number computed as the minimum on-hand count across all 3 trays. That
matters because a set isn't really usable if even one tray in it is out on loan — showing the
per-tray breakdown instead of a single combined count is what surfaces that.

**New inventory items only show up correctly sized on the pack list if they're linked to a
catalog item.** The Add Item form (Inventory page and Scan's "not found" fallback) now has an
optional "Match catalog item" field for this — matching pre-fills the name and links the exact
size/side. An item added without a match still shows up in plain inventory, it just won't be
matched by the pack list's size-aware logic. Worth keeping in mind as you scan in real inventory.

## A note on reserve-facility alerts

`facilities.alert_on_withdrawal` is a plain boolean, not hardcoded to any facility name — flip it
on for Lodi (or any facility you want treated as reserve-only) via Supabase's Table Editor. There
is no push notification or SMS here yet — no phone buzzes when someone pulls from it. What
happens instead: the movement shows up in red with a 🚨 icon at the top of Home (for anyone who
opens the app) and in the Activity feed, and stays there until someone taps "Mark replenished."
That's real-time only in the sense that it's visible the next time the app is open — if you want
an actual push/SMS alert the moment it happens, that's a separate, bigger addition (web push
needs a service worker subscription + a Supabase function to trigger it; SMS would mean adding
Twilio or similar). Say the word if the in-app version isn't enough.

## A note on inventory & readiness

**The demand model** matches how you actually pack: for a knee case you bring a full run of every
size on that side, because the surgeon doesn't commit to a size until they're in there. So N
same-side cases need N units of **every** size on that side — 4 right cases → 4 of every right
size, 2 left → 2 of every left size. One complete size-run = one case. (One loaner tote of
inserts = one of every size = one case's worth, which is why the "quick fill a full set" button
exists.)

**Availability combines consignment and loaner.** Loaner tote contents are real inventory rows
linked to the same catalog item, so "how many size-3 right femurs do I have" counts owned and
borrowed together. The tote's outer wrapper row isn't double-counted.

**Lodi is counted but held apart.** The readiness grade is: covered without touching reserve
(✅), covered only by dipping into Lodi (⚠️, flagged to replenish after), or short even with Lodi
(❌ → order a loaner). This is the "don't get caught having quietly drained Lodi" logic — a
size that's only covered by reserve shows amber, not green, and tells you to replenish.

**Sourcing order** when short: Elk Grove → Adventist Memorial Hospital → order a loaner → Lodi
reserve dead last. That's set by each facility's `sourcing_priority` (and `alert_on_withdrawal`
marks the reserve); change the order any time in Supabase's Table Editor → `facilities`. If any
of the real facility names/roles are wrong, fix them there too — renaming is safe, it keeps the
IDs your inventory points at.

**Cross-day depletion** works through live inventory: once a case is logged (or a Lodi pull is
moved/consumed), the counts drop, so a case two days out sees the real, reduced availability. The
app doesn't pre-reserve a specific unit for a future case (you don't know which size they'll use
until surgery) — it reflects what's actually on hand, which is the honest signal.

**Insert item numbers** are now filled in for the full sizes 1–6 × {10,11,12,13,14,17,20}mm × L/R
grid, derived from the confirmed label pattern `02.12.E0{size}{height}F{side}` (your size 3 / 14mm
/ Left label = `02.12.E0314FL`). Spot-check a couple against real boxes, but the pattern held
across every example on your labels and the loaner packing sheet.

## A note on the Hips catalog

You sent Medacta product pages for GMK Revision, Global Hip, Bipolar Head, HighCross, MectaCem-X,
and the Revision Hip Replacement overview. Two things worth knowing before tomorrow:

**GMK Revision is a knee product, not hip** — it's Medacta's revision TKA system (3D metal cones
+ revision stems), so it belongs next to GMK Sphere Primary in the knee catalog, not under
"Hips." Flagging this now so it doesn't get filed under the wrong joint tomorrow.

**Nothing hip-related is seeded in the catalog yet.** The pages describe Medacta's general
lineup, not necessarily what's in your bag — "Global Hip" alone covers 5+ distinct stem systems
(AMIStem-P, Quadra-P, SMS, MasterLoc, X-ACTA), and I don't know which you actually stock, or the
real sizes/REF numbers for any of it. Seeding guesses here would recreate exactly the
false-readiness problem this app has avoided everywhere else (see the "never guess" thread
running through 005/006/007's seed data). What I did instead: added `joint` and `device_type`
columns to the catalog (migration 008) so hip devices organize under their own heading, distinct
from knee, broken down by device (Femoral Stem, Acetabular Cup, Liner, Femoral Head, Bone Cement,
etc.) the same way the knee catalog already breaks down by product line.

**How tomorrow's scan-in actually works**: Add Item now has a Knee/Hip/Other toggle. Pick Hip,
and the catalog search only shows hip devices. First time you scan a given device (say, a
specific Bipolar Head size), it won't be in the catalog — tap "Add as a new catalog item," fill
in device type/product line/side/size/cement type from what's on the label or box, and it's
created and linked in one step. Every subsequent unit of that exact device just matches against
what you already created — no more migrations needed for new hip devices, you build the catalog
as you scan.

**Knee and hip use the exact same entry format, on purpose.** Device type and product line are
both dropdowns, not free text — Femoral Component/Tibial Tray/Tibial Insert/Patella/Instrument
Tray for knee, Femoral Stem/Acetabular Cup/Liner/Femoral Head/Revision Femoral/Revision
Acetabular/Bone Cement for hip, each with an "Other" fallback if the real device isn't listed.
The knee catalog was seeded via migration with consistent values; without the dropdowns, hip
entries typed by hand tomorrow could easily drift into inconsistent wording ("Stem" vs "Femoral
Stem" vs "stem"). The dropdown is the same interaction for both joints — only the option list
changes, since a knee and a hip genuinely have different device types.

A photo field on the same screen lets you attach a picture of the physical item too,
which is the fast, reliable version of "populate the correct spot" — you're always the one
confirming which device it is; nothing tries to guess from the photo. I looked into true
photo-based auto-recognition and intentionally didn't build it: it would need a separate backend
call to a vision model, cost money per photo, and can misidentify similar-looking implants —
too risky for a surgical inventory to run unconfirmed. If a suggest-and-confirm version of that
ever seems worth the cost, say the word.

## A note on FedEx tracking

`movements.tracking_number` exists in the schema now but isn't wired into any screen yet — I
didn't want to guess at the right UX (a field on the Ship action? A separate "add tracking"
step after the fact, since the number isn't always known at ship time?). Tell me how you'd
actually use it and I'll wire it in.

## A note on GS1 scanning and true batch/video scanning

Two different asks bundled into one: **parsing** a GS1-128/DataMatrix barcode into GTIN/lot/
expiration is straightforward string parsing once a code is decoded, and I can build that
whenever you want it — it works fine with the existing single-code-at-a-time camera scanner.
**Detecting multiple GS1 codes simultaneously in one video frame** (scan a whole tote at once) is
a materially harder computer-vision problem — the free scanning library this app uses now isn't
built for that, and the SDKs that do it reliably (Dynamsoft, Scandit) are commercial. My
recommendation, in the README's "What's next" above: build rapid sequential scanning first (scan
item 1, beep, item 2, beep, checking each off the pack list) as the realistic v1, and revisit
true multi-item detection only if that's not fast enough in practice — I don't want to promise
something flaky.

## A note on the activity feed

There's no dedicated "event type" column on `movements` — the feed figures out what happened
from the shape of the row: different `from`/`to` facility means a move; same facility plus a
note starting with "Used" or "Extended" means a case-usage or extension event (those are the
only two same-facility notes the app itself ever writes). Everything else in the sentence — item
name, facility names, who did it, the reason — comes from live lookups against the current
inventory/profile/case records, not from parsing the note text, so it stays accurate even if,
say, an item gets renamed later. The one exception is the "2x" quantity shown for consumable
usage, which is pulled from the note since that's the only place it's recorded.
