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

Every feature from the original brief is now built. See "What's next" for the couple of
nice-to-haves still on the table.

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
3. Repeat for `supabase/migrations/002_calendar_readiness.sql` (adds hip cases and the
   total/partial distinction the readiness checklist uses to pick the right template) and
   `supabase/migrations/003_loaner_extensions.sql` (adds the extension date/reason columns the
   loaner return countdown uses).
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

Everything from the original brief is built. What's left is polish and nice-to-haves — tell me
what you want to tackle:

1. **Offline queueing** for scans made without signal (explicitly called a "nice to have,
   don't block v1" in the original brief).
2. Make the extension-suggestion logic smarter — right now the "spare unit" check doesn't see
   whether that spare is itself needed for something else soon.
3. Give Staging, Loaners, and Activity their own bottom-nav tabs instead of living under
   Home/Inventory links — worth it once you're using all of them daily and don't want the extra
   tap.
4. Any real-world friction once you and your team are actually using it day to day — that's
   probably more valuable to fix than anything on this list.

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
src/hooks/useAuth.tsx     # session + profile state
src/pages/Calendar.tsx    # Wednesday-anchored week view (route: /cases)
src/pages/StagingReport.tsx  # the staging report (route: /staging)
src/pages/LoanerReturns.tsx  # the loaner return countdown (route: /loaners)
src/pages/ActivityFeed.tsx   # the team activity feed (route: /activity)
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

## A note on the activity feed

There's no dedicated "event type" column on `movements` — the feed figures out what happened
from the shape of the row: different `from`/`to` facility means a move; same facility plus a
note starting with "Used" or "Extended" means a case-usage or extension event (those are the
only two same-facility notes the app itself ever writes). Everything else in the sentence — item
name, facility names, who did it, the reason — comes from live lookups against the current
inventory/profile/case records, not from parsing the note text, so it stays accurate even if,
say, an item gets renamed later. The one exception is the "2x" quantity shown for consumable
usage, which is pulled from the note since that's the only place it's recorded.
