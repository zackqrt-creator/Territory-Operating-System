import type { RefObject } from "react";
import { Bold, Heading1, Heading2, Heading3, Italic, Strikethrough, Underline } from "lucide-react";
import { toggleHeadingAtCursor, wrapSelection } from "../lib/wikilinks";

/**
 * Bold/Italic/Underline/Strikethrough/Heading buttons for a plain-text
 * textarea. Applies Obsidian-style markdown marks (**bold**, *italic*,
 * ~~strike~~, ++underline++, # heading) around the current selection rather
 * than switching to a rich-text/HTML editor — keeps the body a plain string,
 * which is what search, checklist toggling, and [[link]] parsing all depend
 * on staying true.
 */
export default function FormatToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  function applyWrap(before: string, after: string = before) {
    const el = textareaRef.current;
    if (!el) return;
    const { value: nextValue, selStart, selEnd } = wrapSelection(
      value,
      el.selectionStart,
      el.selectionEnd,
      before,
      after,
    );
    onChange(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function applyHeading(level: 1 | 2 | 3) {
    const el = textareaRef.current;
    if (!el) return;
    const { value: nextValue, cursor } = toggleHeadingAtCursor(value, el.selectionStart, level);
    onChange(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  const buttonClass = "rounded-lg p-2 text-slate-400 active:bg-slate-800";

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-800/40 p-1">
      <button type="button" title="Bold" onClick={() => applyWrap("**")} className={buttonClass}>
        <Bold className="h-4 w-4" />
      </button>
      <button type="button" title="Italic" onClick={() => applyWrap("*")} className={buttonClass}>
        <Italic className="h-4 w-4" />
      </button>
      <button type="button" title="Underline" onClick={() => applyWrap("++")} className={buttonClass}>
        <Underline className="h-4 w-4" />
      </button>
      <button type="button" title="Strikethrough" onClick={() => applyWrap("~~")} className={buttonClass}>
        <Strikethrough className="h-4 w-4" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-700" />
      <button type="button" title="Heading 1 (large)" onClick={() => applyHeading(1)} className={buttonClass}>
        <Heading1 className="h-4 w-4" />
      </button>
      <button type="button" title="Heading 2 (medium)" onClick={() => applyHeading(2)} className={buttonClass}>
        <Heading2 className="h-4 w-4" />
      </button>
      <button type="button" title="Heading 3 (small)" onClick={() => applyHeading(3)} className={buttonClass}>
        <Heading3 className="h-4 w-4" />
      </button>
    </div>
  );
}
