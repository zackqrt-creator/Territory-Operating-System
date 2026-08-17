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

/**
 * Renders [[Title]] / [[Title|Alias]] as clickable spans, and inline
 * character formatting as styled spans; escapes everything else as plain
 * text. Formatting marks match Obsidian's own conventions where one exists
 * (**bold**, *italic*, ~~strikethrough~~) and its formatting-toolbar plugin's
 * convention where CommonMark has none (++underline++ — plain underline has
 * no standard markdown syntax since undecorated underline usually means
 * "this is a link").
 */
export interface RenderToken {
  type: "text" | "link" | "bold" | "italic" | "strike" | "underline";
  text: string;
  /** Display text (the alias, if given) — only present on link tokens. */
  display?: string;
}

const CHECKLIST_RE = /^(\s*)-\s*\[([ xX])\]\s*(.*)$/;
const HEADING_RE = /^(#{1,3})\s+(.*)$/;

export interface BodyBlock {
  type: "text" | "checklist" | "heading";
  /** Rendered content for a text/heading block; item text for a checklist block. */
  content: string;
  checked?: boolean;
  /** 1-3, headings only — the equivalent of a "font size" in a plain-text body. */
  level?: 1 | 2 | 3;
  /** Index into the body's split-by-"\n" lines — needed to toggle this exact line back. */
  lineIndex?: number;
}

/**
 * Splits a note/page body into text blocks and individual checklist lines
 * ("- [ ] text" / "- [x] text"), so a checklist item can render as a real,
 * independently-toggleable checkbox while everything else still renders as
 * normal wrapped prose. Consecutive non-checklist lines are grouped into one
 * text block so whitespace-pre-wrap keeps their original line breaks.
 */
export function parseBodyBlocks(body: string): BodyBlock[] {
  const lines = body.split("\n");
  const blocks: BodyBlock[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({ type: "text", content: textBuffer.join("\n") });
      textBuffer = [];
    }
  };

  lines.forEach((line, i) => {
    const checklistMatch = line.match(CHECKLIST_RE);
    const headingMatch = line.match(HEADING_RE);
    if (checklistMatch) {
      flushText();
      blocks.push({
        type: "checklist",
        content: checklistMatch[3],
        checked: checklistMatch[2].toLowerCase() === "x",
        lineIndex: i,
      });
    } else if (headingMatch) {
      flushText();
      blocks.push({
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length as 1 | 2 | 3,
        lineIndex: i,
      });
    } else {
      textBuffer.push(line);
    }
  });
  flushText();
  return blocks;
}

/** Flips a checklist line's [ ]/[x] state at the given line index; returns the updated body. */
export function toggleChecklistLine(body: string, lineIndex: number): string {
  const lines = body.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return body;
  const match = line.match(CHECKLIST_RE);
  if (!match) return body;
  const nextMark = match[2].toLowerCase() === "x" ? " " : "x";
  lines[lineIndex] = `${match[1]}- [${nextMark}] ${match[3]}`;
  return lines.join("\n");
}

/** Appends a new empty checklist item to a body, on its own line. */
export function appendChecklistItem(body: string): string {
  const trimmed = body.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n- [ ] ` : "- [ ] ";
}

// Bold is tried before italic so "**x**" isn't misread as two stray
// asterisks around "*x*". A mark's captured content excludes its own
// delimiter character, so same-type nesting (bold-inside-bold) can't
// happen; the renderer re-tokenizes captured content, so a link or a
// different-delimiter mark (e.g. a [[link]] inside **bold**) still parses.
const INLINE_RE =
  /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|\+\+([^+]+)\+\+|~~([^~]+)~~|\*([^*]+)\*/g;

export function tokenizeBody(body: string): RenderToken[] {
  const tokens: RenderToken[] = [];
  let lastIndex = 0;
  const re = new RegExp(INLINE_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    if (match.index > lastIndex) tokens.push({ type: "text", text: body.slice(lastIndex, match.index) });
    const [, linkTitle, linkAlias, bold, underline, strike, italic] = match;
    if (linkTitle !== undefined) {
      tokens.push({ type: "link", text: linkTitle.trim(), display: linkAlias?.trim() ?? linkTitle.trim() });
    } else if (bold !== undefined) {
      tokens.push({ type: "bold", text: bold });
    } else if (underline !== undefined) {
      tokens.push({ type: "underline", text: underline });
    } else if (strike !== undefined) {
      tokens.push({ type: "strike", text: strike });
    } else if (italic !== undefined) {
      tokens.push({ type: "italic", text: italic });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < body.length) tokens.push({ type: "text", text: body.slice(lastIndex) });
  return tokens;
}

/**
 * Wraps (or unwraps, if the selection is already exactly wrapped) the
 * current textarea selection with a formatting marker — what a Bold/Italic/
 * etc. toolbar button does. With nothing selected, it inserts an empty pair
 * and leaves the cursor between them so typing continues inside the marks.
 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string = before,
): { value: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end);

  // Toggle off if the selection already carries exactly this marker.
  const beforeSlice = value.slice(start - before.length, start);
  const afterSlice = value.slice(end, end + after.length);
  if (selected && beforeSlice === before && afterSlice === after) {
    const nextValue = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
    return { value: nextValue, selStart: start - before.length, selEnd: end - before.length };
  }

  const nextValue = value.slice(0, start) + before + selected + after + value.slice(end);
  if (selected) {
    return { value: nextValue, selStart: start + before.length, selEnd: start + before.length + selected.length };
  }
  const cursor = start + before.length;
  return { value: nextValue, selStart: cursor, selEnd: cursor };
}

/**
 * Toggles a heading level (the plain-text stand-in for "font size") on the
 * line the cursor is currently on. Re-applying the same level removes it;
 * applying a different level replaces it.
 */
export function toggleHeadingAtCursor(
  value: string,
  cursor: number,
  level: 1 | 2 | 3,
): { value: string; cursor: number } {
  const lines = value.split("\n");
  let pos = 0;
  let lineIdx = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = pos + lines[i].length;
    if (cursor <= lineEnd) {
      lineIdx = i;
      break;
    }
    pos = lineEnd + 1; // +1 for the newline
  }

  const line = lines[lineIdx];
  const match = line.match(HEADING_RE);
  const marker = "#".repeat(level) + " ";
  let nextLine: string;
  let delta: number;

  if (match && match[1].length === level) {
    nextLine = match[2];
    delta = -(match[1].length + 1);
  } else if (match) {
    nextLine = marker + match[2];
    delta = marker.length - (match[1].length + 1);
  } else {
    nextLine = marker + line;
    delta = marker.length;
  }

  lines[lineIdx] = nextLine;
  return { value: lines.join("\n"), cursor: Math.max(pos, cursor + delta) };
}
