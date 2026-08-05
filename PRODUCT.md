# Territory OS

Field operations system for an orthopedic device rep. Tracks loaner kits,
instrument trays, implants and consumables as they move between storage
facilities, surgery centers and the rep's trunk.

## Platform

`web` — mobile-first PWA, installed to the home screen. React 19 + Vite +
Tailwind v4 + Supabase. Used one-handed on a phone; occasionally on a laptop.

## Primary user

A single orthopedic device rep (Medacta knee and hip), plus a teammate. Not a
multi-tenant product with an open sign-up. Everyone who reaches the sign-in
screen already knows what the product is — confirmed by the user, 2026-08-05.

The operating scene: standing in a hospital corridor or the back of a car,
between cases, often gloved-adjacent and always in a hurry. Bright ambient
light, sometimes outdoors. This forces the light theme and the 44px tap-target
floor already in the codebase.

## The job

Two halves that the product insists carry equal weight:

1. **Counts.** What is in every tote, where each tracked asset physically is
   right now, what a case needs versus what is on hand, and when a loaner has
   to ship back.
2. **Knowledge.** Why a tray came back short, what a surgeon prefers, what was
   promised and to whom — filed against the tray, surgeon or shipment it
   belongs to rather than in a phone's notes app.

Confirmed by the user, 2026-08-05: what the product must prove first is that
these two halves live together on the same record. This is the position, not a
feature list.

## Meaningfully different mechanism

Notes and tasks hang off the same records as the inventory, so the thing you
learned on Monday surfaces on the screen you open Thursday. A spreadsheet can
hold the counts; it cannot hold why.

Supporting capabilities, all built: GS1 DataMatrix scanning (GTIN, lot, expiry
in one pass), case readiness against real on-hand stock, pack-list demand
aggregation, staging (what goes in the car), loaner ship-by countdowns,
canonical wiki pages per entity with `[[wikilinks]]` and backlinks.

## Terminology

Set, tote, tray, loaner, consignment, case, facility, sterile processing,
ship-by, readiness, pack list, staging. KAONE is a product line, not a
generic term. "Page" means the durable Knowledge layer (`pages` table);
"note" means raw capture (`territory_notes`). These are different things and
the words are not interchangeable.

## Durable constraints

- Supabase credentials live in `.env.local`, never hardcoded.
- Light theme, achieved by inverting Tailwind's slate ramp in place in
  `src/index.css`. Documented contrast ratios live in that file's comments.
- 44px minimum tap target, in `@layer base` so a control can opt out with
  `min-h-0`.
- The sign-in screen must stay reachable and must carry the build stamp and a
  hard-reset control: a cached service worker can pin a device to an old build,
  and this is the one screen always reachable when that happens.
- Password is the default sign-in method. The emailed magic link is rate
  limited to a couple of sends a day and has previously locked the user out of
  their own inventory mid-workday.
- Icons are lucide, drawn, one stroke weight. Not emoji.

## Brand commitments

Product name **Territory OS**. Former name CaseTrack, retired. `BrandMark`
component exists and is in use. No other confirmed brand assets.

## Open

- Whether a teammate account beyond the primary user is active yet.
- No public marketing surface exists or is planned as of 2026-08-05.
