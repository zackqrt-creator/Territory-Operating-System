export interface ParsedCase {
  case_id: string | null;
  surgery_type: "KNEE" | "INSTRUMENT";
  side: "LEFT" | "RIGHT" | null;
  surgery_date: string; // ISO date, YYYY-MM-DD
  surgery_time: string | null; // HH:MM
  raw: string;
}

const DATE_TIME_RE = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/;
const TYPE_RE = /\b(KNEE|INSTRUMENT)\b/i;
const SIDE_RE = /\b(LEFT|RIGHT)\b/i;

/**
 * Parses raw text copy-pasted from the myOPS case table. Column order in a
 * screen copy/paste is unreliable, so this scans each line for known
 * patterns (date/time, surgery_type, side) rather than splitting on a fixed
 * column layout. case_id is best-effort: the longest run of 3+ digits on
 * the line outside the date/time match. Callers must show a preview so the
 * rep can drop bad rows before committing.
 */
export function parsePasteText(text: string): ParsedCase[] {
  const lines = text.split(/\r?\n/);
  const results: ParsedCase[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const dateMatch = trimmed.match(DATE_TIME_RE);
    const typeMatch = trimmed.match(TYPE_RE);
    if (!dateMatch || !typeMatch) continue; // not a recognizable case row

    const sideMatch = trimmed.match(SIDE_RE);
    const withoutDate = trimmed.replace(DATE_TIME_RE, " ");
    const idCandidates = [...withoutDate.matchAll(/\b\d{3,}\b/g)].map((m) => m[0]);
    idCandidates.sort((a, b) => b.length - a.length);

    results.push({
      case_id: idCandidates[0] ?? null,
      surgery_type: typeMatch[1].toUpperCase() as "KNEE" | "INSTRUMENT",
      side: sideMatch ? (sideMatch[1].toUpperCase() as "LEFT" | "RIGHT") : null,
      surgery_date: dateMatch[1],
      surgery_time: dateMatch[2].slice(0, 5),
      raw: trimmed,
    });
  }

  return results;
}

/** Dedupe on case_id; rows with no detected case_id are kept (never merged). */
export function dedupeByCaseId(cases: ParsedCase[]): { rows: ParsedCase[]; duplicates: number } {
  const seen = new Set<string>();
  const rows: ParsedCase[] = [];
  let duplicates = 0;
  for (const c of cases) {
    if (c.case_id === null) {
      rows.push(c);
      continue;
    }
    if (seen.has(c.case_id)) {
      duplicates++;
      continue;
    }
    seen.add(c.case_id);
    rows.push(c);
  }
  return { rows, duplicates };
}
