# The one stack

Zack's standing instruction: **one project, not multiple.** This file is the
answer to "which one is real", so it stops being re-litigated.

Established 2026-07-31 by reading the Supabase, GitHub and Vercel accounts
directly. There are three duplicated surfaces, and in all three the duplicate
dates from **2026-06-18** — a first attempt that was abandoned when the current
build started on 2026-07-20.

## Keep

| Surface | Name | Detail |
| --- | --- | --- |
| **Supabase** | `Zack CaseTrack` | ref `tylytbjxizxukefpplcw`, us-west-1, ACTIVE_HEALTHY. 35 tables, RLS on all, 931 catalog items, the auth users. |
| **GitHub** | `zackqrt-creator/Territory-Operating-System` | public, ~1 MB, the live app. Formerly `Claude-skills`. |
| **Vercel** | `claude-skills` | `prj_UD1xhMR0U2mRGjmLs4eSEwrI4tC7`, serves `claude-skills-dun.vercel.app`. |

## Delete

| Surface | Name | Why it is dead |
| --- | --- | --- |
| **Supabase** | `zackqrt-creator's Project` | ref `sgfjsoanfhmpjcvwbzqx`, us-east-1, **INACTIVE** (auto-paused). Created 2026-06-18. Nothing points at it. |
| **GitHub** | `zackqrt-creator/casetrack-app` | public, 21 KB, last pushed 2026-06-18 — same day as the dead Supabase project. A stub from the first attempt. |
| **Vercel** | `kit-log` | `prj_VjPkD00a0Q02i3gb6abrktEWEkjJ`. One deployment, 2026-07-26, **no git connection** (`meta: {}`) — a one-off manual upload. |

**Verify before deleting the Supabase project.** It is paused, so it cannot be
queried without restoring it first. Restore → check it is empty → delete. Do
not delete a database that has not been looked inside.

## Unrelated — leave alone

`medacta-training` and `pantrypal` (both Vercel + GitHub) are separate products.
`Claude-skills-1`, `PiLegalPlatform`, `healthcare-crm`, `kai-ats-system`,
`Healthcare_CRM`, `Writteninstone`, `Pantrypal` are older, unrelated work.

## The guard

`src/lib/supabase.ts` pins `CANONICAL_PROJECT_REF` and warns to the console if
`VITE_SUPABASE_URL` points anywhere else. It deliberately warns rather than
throws — a fork or a local stack is legitimate — but a mismatch can no longer be
silent. Silence was the risk: two projects with the same shape means a build can
talk to the empty one and report "no inventory" instead of failing outright.

## Naming

The Vercel project is still called `claude-skills`, so the URL is
`claude-skills-dun.vercel.app`. Renaming the project **breaks that hostname**,
which is what the installed home-screen icon points at. To get a Territory OS
address without breaking anything, *add* a domain (Vercel → Settings → Domains)
rather than renaming.
