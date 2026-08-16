import { useEffect, useRef, useState } from "react";
import { Bot, Send, User } from "lucide-react";
import {
  listCaseTemplatesWithItems,
  listFacilities,
  listInventory,
  listUpcomingCases,
} from "../lib/api";
import type { CaseRow, CaseTemplateWithItems, Facility, InventoryItem } from "../lib/types";
import { resolveDayQuery } from "../lib/dayQuery";
import { buildDayBriefing, formatBriefingAnswer } from "../lib/dayBriefing";

interface Message {
  id: string;
  from: "you" | "assistant";
  text: string;
}

const SUGGESTIONS = ["Are we set up for today?", "What's missing tomorrow?", "Ready for Wednesday?"];

/**
 * Phase 1 of the assistant vision: ask about a day's case readiness in plain
 * language, get a real answer. Deliberately NOT a model call — every answer
 * here is the readiness engine's own output in sentence form, so it can
 * never invent a gap that isn't real or miss one that is.
 *
 * Open-ended questions ("what's the deal with this product line") aren't
 * answerable yet — that needs an actual LLM call over your notes/knowledge
 * base, which is the next phase. This one says so rather than guessing.
 */
export default function Assistant() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      from: "assistant",
      text: "Ask me about a day — \"are we set up for Wednesday\" or \"what's missing tomorrow\". I check every case's readiness the same way the app does everywhere else, so the answer is always real.",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([listUpcomingCases(), listCaseTemplatesWithItems(), listInventory(), listFacilities()])
      .then(([c, t, i, f]) => {
        setCases(c);
        setTemplates(t);
        setInventory(i);
        setFacilities(f);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const you: Message = { id: `${Date.now()}-you`, from: "you", text: trimmed };

    const resolved = resolveDayQuery(trimmed);
    let answer: string;
    if (!resolved) {
      answer =
        "I can only answer day-readiness questions right now — try \"are we set up for [a day]\" or \"what's missing [today/tomorrow/a weekday]\". Open-ended knowledge questions are coming in the next phase.";
    } else {
      const briefing = buildDayBriefing(resolved.date, resolved.label, cases, templates, inventory, facilities);
      answer = formatBriefingAnswer(briefing);
    }

    const reply: Message = { id: `${Date.now()}-assistant`, from: "assistant", text: answer };
    setMessages((prev) => [...prev, you, reply]);
    setInput("");
  }

  return (
    <div className="flex min-h-screen flex-col px-4 pb-40 pt-6">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-sky-400" />
        <h1 className="text-2xl font-bold text-slate-100">Assistant</h1>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {loading ? "Loading today's picture…" : "Day-readiness Q&A, backed by the same engine as the rest of the app."}
      </p>

      <div className="mt-4 flex-1 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.from === "you" ? "justify-end" : "justify-start"}`}>
            {m.from === "assistant" && (
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-950 text-sky-400">
                <Bot className="h-3.5 w-3.5" />
              </span>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                m.from === "you"
                  ? "rounded-tr-sm bg-sky-600 text-white"
                  : "rounded-tl-sm border border-slate-700 bg-slate-800/70 text-slate-200"
              }`}
            >
              {m.text}
            </div>
            {m.from === "you" && (
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-400">
                <User className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={loading}
              className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div
        className="fixed inset-x-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur-xl"
        style={{ bottom: "calc(65px + var(--safe-bottom))" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mx-auto flex max-w-lg items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Are we set up for Wednesday?"
            disabled={loading}
            className="min-w-0 flex-1 rounded-full border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white disabled:opacity-50"
            aria-label="Ask"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
