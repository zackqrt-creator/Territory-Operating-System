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
- **Surgery calendar**, Wednesday-anchored week view. Each case is matched to its case template
  (TKA/THA/Partial Knee/Partial Hip) and checked against live inventory at that case's facility.
  Gaps show red, right down to which other facility has the item — tapping a case opens the full
  checklist, and a gap has a one-tap "Move to [facility]" action wired straight into the
  inventory move flow.
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
src/hooks/useAuth.tsx     # session + profile state
src/pages/Calendar.tsx    # Wednesday-anchored week view (route: /cases)
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
