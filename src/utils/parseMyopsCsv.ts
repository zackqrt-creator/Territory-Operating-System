/**
 * Parser for the real myOPS case/loaner CSV export (File > Export from the
 * myOPS case table). Unlike the copy/paste parser, the CSV has a stable
 * header row, so fields are looked up by column name instead of pattern
 * scanning.
 *
 * Privacy: patient_name / patient_first_name / patient_last_name /
 * patient_identifier are deliberately never read. Case logistics don't need
 * PHI, and keeping names out of the app's database avoids HIPAA exposure.
 * patient_comment IS kept (it carries implant-size context for revisions,
 * e.g. "Femur- 2, Tibia - 1, Insert - 14mm").
 */

export interface MyopsCsvRow {
  case_id: string | null;
  surgery_type: "KNEE" | "HIP" | "INSTRUMENT";
  side: "LEFT" | "RIGHT" | null;
  surgery_date: string; // YYYY-MM-DD
  surgery_time: string | null; // HH:MM
  time_tba: boolean;
  status: "scheduled" | "completed";
  notes: string | null;
  purchase_order_no: string | null;
  invoice_no: string | null;
  billing_status: "none" | "po_received" | "invoiced";
}

export interface MyopsCsvResult {
  rows: MyopsCsvRow[];
  canceled: number;
  unrecognized: number; // rows with a surgery_type we don't track (or none)
  error: string | null;
}

/** Minimal RFC 4180 CSV reader: quoted fields, "" escapes, newlines in quotes. */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const TIME_RE = /\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/;

export function parseMyopsCsv(text: string): MyopsCsvResult {
  const table = parseCsvText(text);
  if (table.length < 2) {
    return { rows: [], canceled: 0, unrecognized: 0, error: "No data rows found in this file." };
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  if (col("surgery_type") === -1 || col("surgery_date") === -1) {
    return {
      rows: [],
      canceled: 0,
      unrecognized: 0,
      error:
        "This doesn't look like a myOPS case export — missing the surgery_type / surgery_date columns.",
    };
  }

  const get = (r: string[], name: string): string => {
    const i = col(name);
    return i === -1 ? "" : (r[i] ?? "").trim();
  };

  const rows: MyopsCsvRow[] = [];
  let canceled = 0;
  let unrecognized = 0;

  for (const r of table.slice(1)) {
    const type = get(r, "surgery_type").toUpperCase();
    if (type !== "KNEE" && type !== "HIP" && type !== "INSTRUMENT") {
      unrecognized++;
      continue;
    }

    const status = get(r, "status").toLowerCase();
    if (status === "canceled" || status === "cancelled") {
      canceled++;
      continue;
    }

    const dateField = get(r, "surgery_date") || get(r, "date");
    const dateMatch = dateField.match(DATE_RE);
    if (!dateMatch) {
      unrecognized++;
      continue;
    }

    const sideRaw = (get(r, "surgery_side") || get(r, "surgery_side_c")).toUpperCase();
    const side = sideRaw === "LEFT" || sideRaw === "RIGHT" ? sideRaw : null;

    const timeTba = get(r, "time_tba").toLowerCase() === "true";
    // The clock time is read literally from the timestamp: myOPS labels these
    // "UTC" but stores local surgery times (a 07:30 case is a 7:30am case).
    const timeMatch = get(r, "date").match(TIME_RE);
    const time = !timeTba && timeMatch ? timeMatch[1] : null;

    const noteParts: string[] = [];
    const alignment = get(r, "alignment");
    if (alignment) noteParts.push(`Alignment: ${alignment}`);
    const shipDate = get(r, "so_shipment_date").match(DATE_RE)?.[1];
    const returnDate = get(r, "so_return_date").match(DATE_RE)?.[1];
    if (shipDate || returnDate) {
      noteParts.push(
        `Loaner${shipDate ? ` ships ${shipDate}` : ""}${shipDate && returnDate ? "," : ""}${returnDate ? ` due back ${returnDate}` : ""}`,
      );
    }
    if (get(r, "revision").toLowerCase() === "true") noteParts.push("Revision");
    const classifications = ["classification_0", "classification_1", "classification_2", "classification_3"]
      .map((c) => get(r, c))
      .filter(Boolean);
    if (classifications.length > 0) noteParts.push(`myOPS class: ${classifications.join(" / ")}`);
    const comment = get(r, "patient_comment");
    if (comment) noteParts.push(comment.replace(/\s*\n\s*/g, "; "));

    const po = get(r, "purchase_order_no") || null;
    const inv = get(r, "posted_invoice_no") || null;
    rows.push({
      case_id: get(r, "case_id") || null,
      surgery_type: type,
      side,
      surgery_date: dateMatch[1],
      surgery_time: time,
      time_tba: timeTba,
      status: status === "done" ? "completed" : "scheduled",
      notes: noteParts.length > 0 ? noteParts.join(" · ") : null,
      purchase_order_no: po,
      invoice_no: inv,
      billing_status: inv ? "invoiced" : po ? "po_received" : "none",
    });
  }

  return { rows, canceled, unrecognized, error: null };
}

/** Dedupe on case_id, keeping the first occurrence; rows without an id are kept. */
export function dedupeMyopsRows(rows: MyopsCsvRow[]): { rows: MyopsCsvRow[]; duplicates: number } {
  const seen = new Set<string>();
  const out: MyopsCsvRow[] = [];
  let duplicates = 0;
  for (const r of rows) {
    if (r.case_id && seen.has(r.case_id)) {
      duplicates++;
      continue;
    }
    if (r.case_id) seen.add(r.case_id);
    out.push(r);
  }
  return { rows: out, duplicates };
}
