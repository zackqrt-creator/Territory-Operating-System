# `link-note` — the app's first AI call

Reads a captured note and proposes which surgeons, facilities and cases it is
about. The rep approves each suggestion; nothing is written on their behalf.

## Why it is a server function

Territory OS is a client-side PWA. Every `VITE_` variable is compiled into the
bundle and readable by anyone who opens devtools, so **an Anthropic key in the
app is a published key**. AGENTS.md records that the previous prototype
hardcoded its Supabase credentials in a public repo, and that this is one of the
reasons it is dead. The key therefore lives in Supabase's secret store and the
browser only ever talks to this endpoint, carrying the user's own JWT.

The function creates its Supabase client with that JWT, so RLS scopes the
candidate lists to the caller's territory. It holds no privileged database
credential of its own.

## Turning it on

```sh
# 1. The key. Never commit this; never prefix it with VITE_.
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 2. Deploy.
supabase functions deploy link-note
```

Until both are done, `suggestNoteLinks()` returns an empty list and the capture
sheet says "Nothing obvious to link it to" — the app works exactly as it did
before. Nothing breaks by not deploying this.

## What it costs

One Haiku call per note, and the candidate list is deliberately bounded:
surgeons, facilities, and cases from the last two weeks forward, capped at 40.
For this territory that is a few hundred tokens, so a note costs a fraction of
a cent.

Two deliberate omissions:

- **The 931-row catalog is not sent.** It would add roughly 9,000 tokens to
  every note to catch a minority of mentions. A cheap call that quietly stops
  being cheap is how a feature like this gets switched off.
- **No prompt caching.** Haiku's minimum cacheable prefix is 4,096 tokens and
  this prompt is far shorter, so a `cache_control` marker would do nothing at
  all except look like it was doing something.

Override the model with the `LINK_NOTE_MODEL` secret if you want to try a
larger one:

```sh
supabase secrets set LINK_NOTE_MODEL=claude-sonnet-5
```

## Why it suggests instead of linking

A wrong link is worse than no link, because once saved it is invisible — it
just quietly makes a future search wrong. So every suggestion carries a quote
from the note that justifies it, and the rep taps to accept. Same
review-before-save bargain as the packing-slip scanner.

Two guards beyond the prompt:

- The response is constrained by a JSON schema, so the shape is guaranteed.
- Every returned `entity_id` is re-checked against the candidate list
  server-side before it is returned. A schema constrains shape, not
  truthfulness — a model can still name an id it was never offered, and that
  one is dropped rather than shown.

`entity_type` is attached from our own candidate record, never from the model's
answer.
