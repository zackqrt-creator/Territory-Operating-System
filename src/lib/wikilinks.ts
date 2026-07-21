/**
 * [[Wikilink]] parsing and structured "Key:: value" field extraction for
 * wiki pages. Kept dependency-free and pure so it's cheap to unit test and
 * safe to re-run on every save (link/field state is always fully
 * re-derived from the current body, never patched incrementally).
 */

const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const FIELD_RE = /^([A-Za-z][A-Za-z0-9 _-]*)::\s*(.+)$/;

/** Every distinct [[Title]] referenced in a page body, in first-seen order. */
export function extractLinkTitles(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(LINK_RE)) {
    const title = match[1].trim();
    if (title && !seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase());
      out.push(title);
    }
  }
  return out;
}

export interface StructuredField {
  key: string;
  /** Raw value text; [[links]] inside it are left intact for the caller to resolve. */
  value: string;
  /** Titles linked within this field's value, e.g. `Excludes:: [[San Joaquin General]]`. */
  linkedTitles: string[];
}

/**
 * Obsidian-Dataview-style inline fields: a line starting with `Key:: value`.
 * These are the human-editable "rules" a page can carry — e.g.
 * `Set:: [[KAONE Setup]]` or `Excludes:: [[San Joaquin General]]` — read by
 * the pack-list engine instead of a separate settings form.
 */
export function extractStructuredFields(body: string): StructuredField[] {
  const fields: StructuredField[] = [];
  for (const line of body.split("\n")) {
    const match = line.trim().match(FIELD_RE);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    fields.push({ key, value, linkedTitles: extractLinkTitles(value) });
  }
  return fields;
}

/** Slug used for per-territory uniqueness and URL routing — lowercase, dash-separated. */
export function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/** Renders [[Title]] / [[Title|Alias]] as clickable spans; escapes everything else as plain text. */
export interface RenderToken {
  type: "text" | "link";
  text: string;
  /** Display text (the alias, if given) — only present on link tokens. */
  display?: string;
}

export function tokenizeBody(body: string): RenderToken[] {
  const tokens: RenderToken[] = [];
  let lastIndex = 0;
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    if (match.index > lastIndex) tokens.push({ type: "text", text: body.slice(lastIndex, match.index) });
    tokens.push({ type: "link", text: match[1].trim(), display: match[2]?.trim() ?? match[1].trim() });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < body.length) tokens.push({ type: "text", text: body.slice(lastIndex) });
  return tokens;
}
