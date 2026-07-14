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

**Not built yet** (next up — see "What's next" below): the Tuesday staging report, loaner
return countdown view, post-case quick log / replenishment, and the team activity feed.

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
   total/partial distinction the readiness checklist uses to pick the right template).
   - Already ran `001` before? Just run the new `002` file — you don't need to redo `001`.
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

Ranked in the order the original brief lays them out — tell me which to build next:

1. **Tuesday staging report** — the killer feature: what to haul where before Wednesday, and
   what loaners ship back to corporate.
2. **Loaner return countdown** view, sorted most-urgent-first (the red state at 2 days out is
   already computed in `daysUntil()` / used on Home and Inventory, just needs its own dedicated
   list).
3. **Post-case quick log** → auto-generates replenishment list, decrements inventory.
4. **Team activity feed** ("Zack moved GMK tray from A to Vehicle, 7:42 AM") — the `movements`
   table already has everything needed; this is a UI-only addition.
5. **Offline queueing** for scans made without signal.

## Project structure

```
supabase/migrations/      # run these in order in the Supabase SQL editor
src/lib/supabase.ts       # Supabase client
src/lib/api.ts            # all database reads/writes
src/lib/types.ts          # TypeScript types matching the schema
src/lib/readiness.ts      # matches a case to its template, diffs required items against inventory
src/hooks/useAuth.tsx     # session + profile state
src/pages/Calendar.tsx    # Wednesday-anchored week view (route: /cases)
src/pages/                # one file per screen
src/components/           # shared bottom sheets (move item, add item, readiness checklist), nav
src/utils/parsePaste.ts   # myOPS paste-import parser
src/utils/dates.ts        # next-Wednesday default, week math, countdown math
```

## A note on hip cases and "total vs. partial"

Your analyzed myOPS export only had `KNEE`/`INSTRUMENT` values, so paste-import still only
recognizes those two — that's what your actual clipboard data will contain. Quick-add now also
has a **Hip** button and a **Total/Partial** toggle (shown for knee and hip, not instrument),
since you do THA and partial cases too; this is what the readiness checklist uses to pick the
right template. Paste-imported cases default to total, since myOPS's export doesn't distinguish
partial in what you pulled — edit a case in Supabase's **Table Editor** → `cases` → `variant`
column if one of the pasted-in cases was actually a partial.
