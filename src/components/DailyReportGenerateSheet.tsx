import { useMemo, useState } from "react";
import { Check, Copy, MessageSquare, Printer, Send } from "lucide-react";
import { generateReportOutputs, textMessageSegments } from "../lib/dailyReport";
import type { DailyReportFull, DailyReportSendMethod, Facility } from "../lib/types";

/**
 * Preview, copy, print, and mark as sent.
 *
 * Nothing here transmits anything. Every path ends with the text on the rep's
 * clipboard or in a print dialog, and the rep sends it from their own mail or
 * messages app. "Mark as sent" is a separate, deliberate second step, and it is
 * what freezes the snapshot -- so the audit trail records what was actually
 * sent rather than what the report happened to say later.
 */

type Tab = "full" | "text";

const METHODS: { value: DailyReportSendMethod; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
  { value: "pdf", label: "PDF" },
  { value: "verbal", label: "Verbal" },
  { value: "other", label: "Other" },
];

export default function DailyReportGenerateSheet({
  report,
  facilities,
  authorName,
  onClose,
  onMarkSent,
}: {
  report: DailyReportFull;
  facilities: Facility[];
  authorName: string | null;
  onClose: () => void;
  onMarkSent: (params: {
    sentTo: string;
    method: DailyReportSendMethod;
    snapshot: { generated_at: string; full: string; text_message: string };
  }) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("full");
  const [copied, setCopied] = useState<Tab | null>(null);
  const [sentTo, setSentTo] = useState(report.sent_to ?? "");
  const [method, setMethod] = useState<DailyReportSendMethod>(report.sent_method ?? "email");
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outputs = useMemo(
    () => generateReportOutputs(report, { facilities, authorName }),
    [report, facilities, authorName],
  );

  const shown = tab === "full" ? outputs.full : outputs.textMessage;

  async function copy(which: Tab) {
    const text = which === "full" ? outputs.full : outputs.textMessage;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1800);
    } catch {
      setError("Couldn't reach the clipboard. Select the text above and copy it by hand.");
    }
  }

  /**
   * Print the report on its own, not the app around it.
   *
   * A hidden iframe rather than window.print() on the page: printing the SPA
   * would carry the nav, the sheet and the app chrome onto the page, and this
   * is the one artifact that has to look deliberate.
   */
  function print() {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) {
      document.body.removeChild(frame);
      setError("Couldn't open the print view.");
      return;
    }
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Territory Operations — Daily Update</title>` +
        `<style>body{font:12pt/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#16233c;margin:28mm 18mm;}` +
        `pre{font:inherit;white-space:pre-wrap;word-break:break-word;margin:0;}</style></head>` +
        `<body><pre></pre></body></html>`,
    );
    doc.close();
    // textContent, not innerHTML: the report is the rep's own prose and must
    // never be interpreted as markup on its way to paper.
    const pre = doc.querySelector("pre");
    if (pre) pre.textContent = outputs.full;

    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }

  async function markSent() {
    if (marking) return;
    setMarking(true);
    setError(null);
    try {
      await onMarkSent({
        sentTo: sentTo.trim(),
        method,
        snapshot: {
          generated_at: new Date().toISOString(),
          full: outputs.full,
          text_message: outputs.textMessage,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark it sent.");
      setMarking(false);
    }
  }

  const segments = textMessageSegments(outputs.textMessage);
  const field =
    "mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-100 placeholder:text-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-5"
        style={{ paddingBottom: "calc(2rem + var(--safe-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
        <h2 className="text-lg font-semibold text-slate-100">Generated report</h2>
        <p className="mt-1 text-xs text-slate-500">
          Nothing is sent from here. Copy or print it, send it yourself, then mark it sent.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setTab("full")}
            className={`rounded-lg py-2.5 font-medium ${tab === "full" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
          >
            <span className="text-sm">Full</span>
          </button>
          <button
            onClick={() => setTab("text")}
            className={`rounded-lg py-2.5 font-medium ${tab === "text" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
          >
            <span className="text-sm">Text message</span>
          </button>
        </div>

        {tab === "text" && (
          <p className="mt-2 text-xs text-slate-500">
            {outputs.textMessage.length} characters · about {segments}{" "}
            {segments === 1 ? "message" : "messages"}
          </p>
        )}

        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-[13px] leading-relaxed text-slate-200">
          {shown}
        </pre>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => copy(tab)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2.5 font-medium text-white"
          >
            {copied === tab ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            <span className="text-sm">{copied === tab ? "Copied" : "Copy"}</span>
          </button>
          <button
            onClick={print}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 py-2.5 font-medium text-slate-300"
          >
            <Printer size={15} aria-hidden />
            <span className="text-sm">Print / PDF</span>
          </button>
        </div>

        <button
          onClick={() => copy(tab === "full" ? "text" : "full")}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 py-2.5 font-medium text-slate-400"
        >
          <MessageSquare size={15} aria-hidden />
          <span className="text-sm">
            Copy the {tab === "full" ? "text-message" : "full"} version instead
          </span>
        </button>

        <div className="mt-6 border-t border-slate-700 pt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
            Mark as sent
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Freezes a copy of exactly this text in the report history.
          </p>

          <label className="mt-3 block">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
              Sent to
            </span>
            <input
              value={sentTo}
              onChange={(e) => setSentTo(e.target.value)}
              className={field}
              placeholder="Manager's name"
            />
          </label>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`rounded-lg py-2.5 font-medium ${method === m.value ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                <span className="text-sm">{m.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={markSent}
            disabled={marking}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-3 font-semibold text-white disabled:opacity-50"
          >
            <Send size={16} aria-hidden />
            {marking ? "Saving…" : "Mark as sent"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 border-l border-red-400 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button onClick={onClose} className="mt-3 w-full text-slate-500 underline">
          <span className="text-sm">Close</span>
        </button>
      </div>
    </div>
  );
}
