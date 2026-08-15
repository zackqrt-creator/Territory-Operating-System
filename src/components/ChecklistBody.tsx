import { parseBodyBlocks, tokenizeBody } from "../lib/wikilinks";

/**
 * Renders a note/page body with interactive checkboxes for any
 * "- [ ] text" / "- [x] text" line, alongside normal wrapped text for
 * everything else. [[links]] inside a checklist item still tokenize via
 * onFollow, same as plain text.
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
    if (!onFollow) return text;
    const tokens = tokenizeBody(text);
    return tokens.map((t, i) =>
      t.type === "text" ? (
        <span key={i}>{t.text}</span>
      ) : (
        <button
          key={i}
          onClick={() => onFollow(t.text)}
          className="rounded bg-sky-950/60 px-1 text-sky-300 underline decoration-sky-700 underline-offset-2"
        >
          {t.display}
        </button>
      ),
    );
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
        ) : (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {renderInline(b.content)}
          </p>
        ),
      )}
    </div>
  );
}
