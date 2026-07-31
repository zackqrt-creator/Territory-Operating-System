import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  acceptQaAnswer,
  createQaAnswer,
  createQaQuestion,
  listProfiles,
  listQaAnswers,
  listQaQuestions,
  listSurgeons,
} from "../lib/api";
import type { Profile, QaAnswer, QaQuestion, Surgeon } from "../lib/types";
import { formatRelativeDay } from "../utils/dates";

export default function QaWall() {
  const { profile } = useAuth();
  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [answers, setAnswers] = useState<QaAnswer[]>([]);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [body, setBody] = useState("");
  const [pinSurgeon, setPinSurgeon] = useState("");
  const [pinType, setPinType] = useState("");
  const [pinProduct, setPinProduct] = useState("");
  const [posting, setPosting] = useState(false);

  function refresh() {
    return Promise.all([listQaQuestions(), listQaAnswers(), listSurgeons(), listProfiles()]).then(
      ([q, a, s, p]) => {
        setQuestions(q);
        setAnswers(a);
        setSurgeons(s);
        setProfiles(p);
      },
    );
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const nameOf = (id: string | null) =>
    id === profile?.id ? "You" : (profiles.find((p) => p.id === id)?.display_name ?? "Someone");

  async function onAsk() {
    if (!body.trim() || !profile) return;
    setPosting(true);
    try {
      await createQaQuestion({
        body: body.trim(),
        pinned_product: pinProduct.trim() || null,
        pinned_surgeon_id: pinSurgeon || null,
        pinned_surgery_type: pinType === "KNEE" || pinType === "HIP" ? pinType : null,
        territory_id: profile.territory_id,
        author_id: profile.id,
      });
      setBody("");
      setPinProduct("");
      setPinSurgeon("");
      setPinType("");
      await refresh();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-slate-100">Q&A wall</h1>
      <p className="mt-1 text-sm text-slate-400">
        Ask the team anything. Pin a question to a product, surgeon, or procedure and it'll show
        up automatically on matching case screens.
      </p>

      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="e.g. Which insert does Dr. Sidhu fall back to when 12mm is too tight?"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500"
        />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <select
            value={pinSurgeon}
            onChange={(e) => setPinSurgeon(e.target.value)}
            className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-100"
          >
            <option value="">Pin surgeon…</option>
            {surgeons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={pinType}
            onChange={(e) => setPinType(e.target.value)}
            className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-100"
          >
            <option value="">Pin procedure…</option>
            <option value="KNEE">Knee</option>
            <option value="HIP">Hip</option>
          </select>
          <input
            value={pinProduct}
            onChange={(e) => setPinProduct(e.target.value)}
            placeholder="Pin product…"
            className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <button
          onClick={onAsk}
          disabled={posting || !body.trim()}
          className="mt-2 w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-2.5 font-semibold text-white shadow-lg shadow-sky-600/20 disabled:opacity-50"
        >
          {posting ? "Posting…" : "Ask the team"}
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : questions.length === 0 ? (
        <p className="mt-8 text-slate-400">No questions yet — ask the first one.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              answers={answers.filter((a) => a.question_id === q.id)}
              surgeons={surgeons}
              nameOf={nameOf}
              meId={profile?.id ?? ""}
              territoryId={profile?.territory_id ?? ""}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  q,
  answers,
  surgeons,
  nameOf,
  meId,
  territoryId,
  onChanged,
}: {
  q: QaQuestion;
  answers: QaAnswer[];
  surgeons: Surgeon[];
  nameOf: (id: string | null) => string;
  meId: string;
  territoryId: string;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const pins = [
    q.pinned_surgeon_id ? surgeons.find((s) => s.id === q.pinned_surgeon_id)?.name : null,
    q.pinned_surgery_type ? (q.pinned_surgery_type === "KNEE" ? "Knee" : "Hip") : null,
    q.pinned_product,
  ].filter(Boolean) as string[];

  async function onAnswer() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await createQaAnswer({ question_id: q.id, body: reply.trim(), territory_id: territoryId, author_id: meId });
      setReply("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(answerId: string) {
    setBusy(true);
    try {
      await acceptQaAnswer(answerId);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
      <p className="text-sm font-medium text-slate-100">{q.body}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span>
          {nameOf(q.author_id)} · {formatRelativeDay(q.created_at)}
        </span>
        {pins.map((p) => (
          <span key={p} className="rounded-full bg-sky-900/50 px-2 py-0.5 text-sky-300">
            📌 {p}
          </span>
        ))}
      </div>

      {answers.length > 0 && (
        <div className="mt-2 space-y-1.5 border-l-2 border-slate-800 pl-3">
          {answers.map((a) => (
            <div key={a.id} className="text-sm">
              <span className={a.accepted ? "text-emerald-300" : "text-slate-300"}>
                {a.accepted ? "✓ " : ""}
                {a.body}
              </span>
              <span className="text-xs text-slate-500"> — {nameOf(a.author_id)}</span>
              {!a.accepted && q.author_id === meId && (
                <button
                  onClick={() => onAccept(a.id)}
                  disabled={busy}
                  className="ml-2 text-xs text-emerald-400 underline"
                >
                  mark best
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAnswer()}
          placeholder="Answer…"
          className="min-h-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
        <button
          onClick={onAnswer}
          disabled={busy || !reply.trim()}
          className="min-h-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
