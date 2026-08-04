/**
 * Reads a captured note and proposes which surgeons, facilities and cases it is
 * about.
 *
 * WHY THIS IS A SERVER FUNCTION, NOT CLIENT CODE
 *
 * Territory OS is a client-side PWA. Every `VITE_`-prefixed variable is baked
 * into the bundle and readable by anyone who opens devtools, so an Anthropic
 * key in the app is a published key. AGENTS.md records that the previous
 * prototype hardcoded its Supabase credentials in a public repo and that this
 * is one of the reasons it is dead. So the key lives in Supabase's secret
 * store, this function reads it from the environment, and the browser only
 * ever talks to this endpoint with the user's own JWT.
 *
 * WHAT IT COSTS
 *
 * Haiku, one call per note, and the candidate list is deliberately bounded:
 * upcoming cases only, plus surgeons and facilities, which together are a few
 * hundred tokens for this territory. A note therefore costs a fraction of a
 * cent. The 931-row catalog is NOT sent -- it would be ~9K tokens on every
 * note to catch a minority of mentions, and a cheap call that quietly stops
 * being cheap is how this kind of feature gets switched off.
 *
 * Prompt caching is deliberately absent: Haiku's minimum cacheable prefix is
 * 4096 tokens and this prompt is far shorter, so a cache_control marker would
 * do nothing at all except look like it was doing something.
 *
 * NOTHING HERE WRITES. The function returns proposals; the rep approves them
 * in the UI and the client writes the links. Same review-before-save bargain
 * as the slip scanner, for the same reason -- a wrong link is worse than no
 * link, because a wrong one is invisible once it is saved.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("LINK_NOTE_MODEL") ?? "claude-haiku-4-5";

/** Kept small on purpose: a long list is a slow, expensive, less accurate call. */
const MAX_CASES = 40;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Candidate {
  entity_type: "case" | "facility" | "surgeon";
  entity_id: string;
  label: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description: "The exact id of a candidate. Never invent one.",
          },
          relationship: {
            type: "string",
            enum: ["about", "related", "issue", "follow_up", "decision"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: {
            type: "string",
            description: "The words in the note that justify this link. Quote them.",
          },
        },
        required: ["entity_id", "relationship", "confidence", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["links"],
  additionalProperties: false,
} as const;

const SYSTEM = `You link a medical device rep's field note to the people, places and cases it mentions.

You will be given a note and a list of candidate entities, each with an id and a label. Return only links you can justify from the note's own words.

Rules:
- Only ever return an entity_id that appears in the candidate list. Never invent an id.
- A surname alone is enough for a surgeon ("Sidhu wants..." links to Dr. Sidhu).
- A note that merely mentions a product or a size links to nothing unless a surgeon, facility or case is also identifiable.
- Relative dates ("next Tuesday", "tomorrow") only identify a case when the candidate list makes it unambiguous. If two cases fit, return neither.
- Prefer returning nothing over guessing. An empty list is a correct answer and is common.
- confidence: "high" when the note names the entity outright; "medium" when it is a clear inference; "low" when it is plausible but arguable.
- evidence must quote the note. If you cannot quote it, do not return the link.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY is not set on this project." }, 500);
    }

    // The caller's own JWT, so RLS scopes the candidate lists to their
    // territory. The function holds no privileged database credential.
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Not signed in." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );

    const { note } = (await req.json()) as { note?: string };
    const text = (note ?? "").trim();
    // Too short to carry a reference worth paying for.
    if (text.length < 12) return json({ links: [] });

    const today = new Date().toISOString().slice(0, 10);
    const [surgeons, facilities, cases] = await Promise.all([
      supabase.from("surgeons").select("id,name"),
      supabase.from("facilities").select("id,name"),
      supabase
        .from("cases")
        .select("id,surgery_date,surgery_type,side,surgeon,facility_id")
        .gte("surgery_date", addDays(today, -14))
        .order("surgery_date")
        .limit(MAX_CASES),
    ]);

    const facilityName = new Map(
      (facilities.data ?? []).map((f: { id: string; name: string }) => [f.id, f.name]),
    );

    const candidates: Candidate[] = [
      ...(surgeons.data ?? []).map((s: { id: string; name: string }) => ({
        entity_type: "surgeon" as const,
        entity_id: s.id,
        label: s.name,
      })),
      ...(facilities.data ?? []).map((f: { id: string; name: string }) => ({
        entity_type: "facility" as const,
        entity_id: f.id,
        label: f.name,
      })),
      ...(cases.data ?? []).map((c: Record<string, string | null>) => ({
        entity_type: "case" as const,
        entity_id: c.id as string,
        label: [
          c.surgery_date,
          c.surgery_type,
          c.side,
          c.surgeon ? `Dr. ${c.surgeon}` : null,
          c.facility_id ? facilityName.get(c.facility_id) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    ];

    if (candidates.length === 0) return json({ links: [] });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            `Today is ${today}.`,
            "",
            "Candidates:",
            ...candidates.map((c) => `${c.entity_id} | ${c.entity_type} | ${c.label}`),
            "",
            "Note:",
            text,
          ].join("\n"),
        },
      ],
    });

    // A safety decline is a valid outcome, not a crash. Treat it as "no links".
    if (response.stop_reason === "refusal") return json({ links: [] });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return json({ links: [] });

    const parsed = JSON.parse(block.text) as {
      links: Array<{
        entity_id: string;
        relationship: string;
        confidence: string;
        evidence: string;
      }>;
    };

    // The schema constrains shape, not truthfulness -- a model can still name
    // an id that was never offered. Re-check every one against the candidate
    // list here rather than trusting it downstream, and attach entity_type from
    // our own record rather than from the response.
    const byId = new Map(candidates.map((c) => [c.entity_id, c]));
    const links = (parsed.links ?? [])
      .map((l) => {
        const candidate = byId.get(l.entity_id);
        if (!candidate) return null;
        return {
          entity_type: candidate.entity_type,
          entity_id: candidate.entity_id,
          label: candidate.label,
          relationship: l.relationship,
          confidence: l.confidence,
          evidence: l.evidence,
        };
      })
      .filter((l) => l !== null);

    return json({
      links,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    // Linking is a bonus on top of a note that is already saved. Never let a
    // failure here look like the note failed.
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
