# START HERE — canonical project pointer

**This repository is the one and only home of the Territory Operations project.**
If you are an agent (Claude Code, Codex, Cursor, or otherwise) and you are
reading this file, you are in the right place. Do not go looking for another
repo, branch, or folder that might be "the real one." There isn't one.

## Identity

| | |
|---|---|
| **Repo** | `zackqrt-creator/Territory-Operating-System` |
| **Trunk** | `main` — the only branch to build on |
| **Product name** | Territory OS |
| **Former name** | **CaseTrack.** Same project, renamed. `casetrack` still appears in the package name, branch names and older commit messages. It is not a separate thing. |

## Things that look like the project but are not

Treat all of the following as dead. Do not read them for reference, do not copy
code out of them, do not push to them.

- **`zackqrt-creator/casetrack-app`** — a 1,088-line single-file prototype
  (`src/DeviceTracker.jsx`), one commit, superseded in full. Its GS1 DataMatrix
  parser now lives here as `src/lib/labelParse.ts` in a more developed form.
- **`claude/camera-territory-operations-62xlro`** — stale branch. Its only
  distinct commit (the label-scan fix) was merged into `main` via PR #1. Zero
  files on it are absent from `main`.
- **`claude/territory-os-medical-logistics-vd131l`** — stale branch, fully
  contained in `main`. The one file unique to it, `src/pages/NotesSearch.tsx`,
  is the retired entity-notes UI, deliberately replaced by `src/pages/Notes.tsx`
  and `src/pages/NoteDetail.tsx`.
- **A local folder named `Claude-skills`** — a stale clone directory name from
  before the repo was renamed. Same repo. Rename it locally if you like.

Unrelated repos in the same account — `medacta-training`, `healthcare-crm`,
`Healthcare_CRM`, `pantrypal-app`, `Pantrypal`, `PiLegalPlatform`,
`kai-ats-system`, `Claude-skills-1`, `Writteninstone` — are **different
products**. Nothing from them belongs here and nothing here belongs in them.

## What this is

Mobile-first PWA for a medical device rep: tracking loaner kits, instrument
trays, implants and consumables as they move between storage facilities,
surgery centers and the rep's trunk. React 19 + Vite + Tailwind v4 + Supabase.

```
src/pages/        screens (Home, Cases, Inventory, Tasks, Notes, …)
src/components/   sheets, nav, scanners
src/lib/          data layer (api.ts) and the engines:
                    readiness.ts   is a case covered
                    packlist.ts    demand aggregation
                    staging.ts     what goes in the car
                    loaners.ts     ship-by countdowns
                    labelParse.ts  implant label + GS1 parsing
supabase/         migrations, numbered and ordered
```

## Working rules

- `npm run build` runs `tsc -b`, Vite, and a build verifier. It must pass.
- `npm run lint` is oxlint. Four warnings are pre-existing (`packingSlip.ts`
  escapes, `useAuth.tsx` fast-refresh); do not count them as yours.
- Supabase credentials come from `.env.local` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`). Never hardcode them — the old prototype did, in a
  public repo, and that is one reason it is dead.
- The theme is **light**. `src/index.css` inverts Tailwind's slate ramp in
  place, so `bg-slate-950` is the page background and `text-slate-100` is the
  ink. Check that file before assuming a color does what its name suggests.

### Known trap: unlayered rules in index.css

`src/index.css` sets base styles **outside any `@layer`**. Unlayered rules beat
every layered one, so a Tailwind utility cannot override them -- the utility is
in `@layer utilities`, which loses.

The `min-height: 44px` tap-target floor has been moved into `@layer base`, so a
control that must be an exact size can now opt out with `min-h-0`. It could not
before: task checkboxes written `h-5 w-5` rendered 20px wide and 44px tall, a
rectangle, in every list in the app, and the ~15 `min-h-0` declarations already
scattered around the codebase were being silently ignored. They now apply, which
is what their authors intended.

Two things that follow from this and are easy to get wrong:

- A `min-height` always beats a smaller `height` regardless of layer. Layering
  alone does not shrink a control; it only makes `min-h-0` reachable. You need
  both.
- `font: inherit` on `button, input, select, textarea` is still unlayered, so
  Tailwind `text-*` utilities are still ignored on those elements. Layering it
  would change type sizes app-wide and needs its own reviewed pass.
