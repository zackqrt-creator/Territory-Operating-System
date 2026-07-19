import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  createBoardComment,
  createBoardPost,
  deleteBoardPost,
  listBoardComments,
  listBoardPosts,
  listProfiles,
  setTodoDone,
} from "../lib/api";
import type { BoardCategory, BoardComment, BoardPost, Profile } from "../lib/types";

const CATEGORIES: { value: BoardCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "inventory", label: "Inventory" },
  { value: "cases", label: "Cases" },
  { value: "schedule", label: "Schedule" },
];
import { formatRelativeDay, formatTimeOfDay } from "../utils/dates";

type Filter = "all" | "todos" | "mine" | "mentions";

export default function TeamBoard() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [catFilter, setCatFilter] = useState<BoardCategory | "all">("all");

  // Read-state: remember the visit so Home can show "N new since last visit".
  useEffect(() => {
    localStorage.setItem("ct_wall_seen", new Date().toISOString());
  }, []);

  function refresh() {
    return Promise.all([listBoardPosts(), listBoardComments(), listProfiles()]).then(
      ([p, c, pr]) => {
        setPosts(p);
        setComments(c);
        setProfiles(pr);
      },
    );
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const nameOf = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p.display_name]));
    return (id: string | null) => (id === profile?.id ? "You" : (id && map.get(id)) || "Someone");
  }, [profiles, profile]);

  const teammates = profiles.filter((p) => p.id !== profile?.id);

  const visible = posts.filter((p) => {
    if (catFilter !== "all" && p.category !== catFilter) return false;
    if (filter === "todos") return p.kind === "todo";
    if (filter === "mine") return p.kind === "todo" && p.assignee_id === profile?.id && !p.done;
    if (filter === "mentions") return profile ? p.mentioned_ids.includes(profile.id) : false;
    return true;
  });

  const openForMe = posts.filter(
    (p) => p.kind === "todo" && p.assignee_id === profile?.id && !p.done,
  ).length;

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Team board</h1>
      <p className="mt-1 text-sm text-slate-400">
        Notes, hand-offs, and to-dos for the whole territory. Assign a to-do, tag whoever needs to
        see it, and keep the thread in one place.
      </p>

      {profile && (
        <Composer
          profile={profile}
          teammates={teammates}
          onPosted={refresh}
        />
      )}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["all", "All"],
            ["todos", "To-dos"],
            ["mine", `Assigned to me${openForMe ? ` (${openForMe})` : ""}`],
            ["mentions", "Mentions me"],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setCatFilter("all")}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            catFilter === "all" ? "bg-slate-600 text-white" : "bg-slate-800/70 text-slate-500"
          }`}
        >
          All topics
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCatFilter(c.value)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              catFilter === c.value ? "bg-slate-600 text-white" : "bg-slate-800/70 text-slate-500"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : visible.length === 0 ? (
        <p className="mt-8 text-slate-400">Nothing here yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              comments={comments.filter((c) => c.post_id === post.id)}
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

function Composer({
  profile,
  teammates,
  onPosted,
}: {
  profile: Profile;
  teammates: Profile[];
  onPosted: () => void;
}) {
  const [body, setBody] = useState("");
  const [isTodo, setIsTodo] = useState(false);
  const [category, setCategory] = useState<BoardCategory>("general");
  const [assignee, setAssignee] = useState<string>("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);

  function toggleTag(id: string) {
    setTagged((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onPost() {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await createBoardPost({
        body: body.trim(),
        kind: isTodo ? "todo" : "note",
        category,
        assignee_id: isTodo ? assignee || null : null,
        mentioned_ids: tagged,
        territory_id: profile.territory_id,
        author_id: profile.id,
      });
      setBody("");
      setIsTodo(false);
      setCategory("general");
      setAssignee("");
      setTagged([]);
      onPosted();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Post a note or hand-off for the team..."
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setIsTodo((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            isTodo ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
          }`}
        >
          {isTodo ? "✓ To-do" : "Make a to-do"}
        </button>
        {isTodo && (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          >
            <option value="">Assign to…</option>
            {teammates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name}
              </option>
            ))}
            <option value={profile.id}>Myself</option>
          </select>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              category === c.value ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-500"
            }`}
          >
            #{c.label.toLowerCase()}
          </button>
        ))}
      </div>

      {teammates.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-slate-500">Tag teammates</p>
          <div className="flex flex-wrap gap-1.5">
            {teammates.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  tagged.includes(t.id)
                    ? "bg-sky-700 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                @{t.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onPost}
        disabled={posting || !body.trim()}
        className="mt-3 w-full rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 px-4 py-2.5 font-semibold text-white shadow-lg shadow-sky-950/40 disabled:opacity-50"
      >
        {posting ? "Posting…" : "Post"}
      </button>
    </div>
  );
}

function PostCard({
  post,
  comments,
  nameOf,
  meId,
  territoryId,
  onChanged,
}: {
  post: BoardPost;
  comments: BoardComment[];
  nameOf: (id: string | null) => string;
  meId: string;
  territoryId: string;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReply, setShowReply] = useState(false);

  async function onToggle() {
    setBusy(true);
    try {
      await setTodoDone(post.id, !post.done, meId);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onReply() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await createBoardComment({
        post_id: post.id,
        body: reply.trim(),
        territory_id: territoryId,
        author_id: meId,
      });
      setReply("");
      setShowReply(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await deleteBoardPost(post.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const isTodo = post.kind === "todo";

  return (
    <div
      className={`rounded-xl border p-3 ${
        isTodo && post.done
          ? "border-emerald-900 bg-emerald-950/20"
          : isTodo
            ? "border-sky-900 bg-sky-950/20"
            : "border-slate-700 bg-slate-900/40"
      }`}
    >
      <div className="flex items-start gap-2">
        {isTodo && (
          <button
            onClick={onToggle}
            disabled={busy}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
              post.done ? "border-emerald-500 bg-emerald-600 text-white" : "border-slate-500"
            }`}
          >
            {post.done ? "✓" : ""}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${post.done ? "text-slate-400 line-through" : "text-white"}`}>
            {post.body}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-slate-400">
              #{post.category}
            </span>
            <span>{nameOf(post.author_id)}</span>
            <span>·</span>
            <span>
              {formatRelativeDay(post.created_at)} {formatTimeOfDay(post.created_at)}
            </span>
            {isTodo && post.assignee_id && (
              <span className="rounded-full bg-sky-900/60 px-2 py-0.5 text-sky-200">
                For: {nameOf(post.assignee_id)}
              </span>
            )}
            {post.done && post.done_by && (
              <span className="text-emerald-400">done by {nameOf(post.done_by)}</span>
            )}
          </div>
          {post.mentioned_ids.length > 0 && (
            <p className="mt-1 text-xs text-sky-400">
              {post.mentioned_ids.map((id) => `@${nameOf(id)}`).join(" ")}
            </p>
          )}
        </div>
        {post.author_id === meId && (
          <button onClick={onDelete} disabled={busy} className="shrink-0 text-xs text-slate-600">
            ✕
          </button>
        )}
      </div>

      {comments.length > 0 && (
        <div className="mt-2 space-y-1.5 border-l-2 border-slate-800 pl-3">
          {comments.map((c) => (
            <div key={c.id} className="text-xs">
              <span className="font-medium text-slate-300">{nameOf(c.author_id)}</span>{" "}
              <span className="text-slate-400">{c.body}</span>
            </div>
          ))}
        </div>
      )}

      {showReply ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onReply()}
            placeholder="Reply…"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <button
            onClick={onReply}
            disabled={busy || !reply.trim()}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowReply(true)}
          className="mt-2 text-xs text-slate-500 underline"
        >
          Reply
        </button>
      )}
    </div>
  );
}
