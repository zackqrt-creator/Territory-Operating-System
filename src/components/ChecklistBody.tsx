import { parseBodyBlocks, tokenizeBody } from "../lib/wikilinks";

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-lg font-bold",
  2: "text-base font-semibold",
  3: "text-sm font-semibold uppercase tracking-wide text-slate-400",
};

/**
 * Renders a note/page body: interactive checkboxes for "- [ ] text" /
 * "- [x] text" lines, headings for "#"/"##"/"###" lines (the plain-text
 * stand-in for font size), and inline **bold** / *italic* / ~~strike~~ /
 * ++underline++ / [[links]] everywhere else.
 */
export default function ChecklistBody({
  body,
  onFollow,
  onToggle,
  className = "text-sm text-slate-200",
}: {
  body: string;
  onFollow?: (title: string) => void;
  /** Called with the line index of the checklist item that was toggled. Omit to render read-only checkboxes. */
  onToggle?: (lineIndex: number) => void;
  className?: string;
}) {
  const blocks = parseBodyBlocks(body);

  function renderInline(text: string) {
    const tokens = tokenizeBody(text);
    return tokens.map((t, i) => {
      switch (t.type) {
        case "bold":
          return <strong key={i}>{renderInline(t.text)}</strong>;
        case "italic":
          return <em key={i}>{renderInline(t.text)}</em>;
        case "underline":
          return (
            <span key={i} className="underline">
              {renderInline(t.text)}
            </span>
          );
        case "strike":
          return (
            <s key={i} className="text-slate-500">
              {renderInline(t.text)}
            </s>
          );
        case "link":
          return onFollow ? (
            <button
              key={i}
              onClick={() => onFollow(t.text)}
              className="rounded bg-sky-950/60 px-1 text-sky-300 underline decoration-sky-700 underline-offset-2"
            >
              {t.display}
            </button>
          ) : (
            <span key={i} className="text-sky-400">
              {t.display}
            </span>
          );
        default:
          return <span key={i}>{t.text}</span>;
      }
    });
  }

  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.type === "checklist" ? (
          <label key={i} className="flex items-start gap-2 py-0.5">
            <input
              type="checkbox"
              checked={b.checked}
              onChange={() => onToggle?.(b.lineIndex!)}
              disabled={!onToggle}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-800 accent-sky-600"
            />
            <span className={b.checked ? "text-slate-500 line-through" : ""}>{renderInline(b.content)}</span>
          </label>
        ) : b.type === "heading" ? (
          <p key={i} className={`whitespace-pre-wrap leading-snug ${HEADING_CLASS[b.level ?? 1]}`}>
            {renderInline(b.content)}
          </p>
        ) : (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {renderInline(b.content)}
          </p>
        ),
      )}
    </div>
  );
}
