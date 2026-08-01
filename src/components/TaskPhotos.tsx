import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { addTaskPhoto, deleteTaskPhoto, listTaskPhotos } from "../lib/api";
import type { TaskPhoto, TaskStage } from "../lib/types";
import { useAuth } from "../hooks/useAuth";

const STAGES: { value: TaskStage; label: string }[] = [
  { value: "todo", label: "Before" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "After" },
];

/**
 * Photos on a task, filed by stage. A rep's proof of what happened is almost
 * always a picture -- the tray as found, mid-fix, and back in the rack -- so
 * each stage gets its own strip and its own camera button.
 *
 * `capture="environment"` opens the rear camera directly on a phone instead of
 * making you dig through the photo library.
 *
 * Hides itself if migration 046 has not been run.
 */
export default function TaskPhotos({
  taskId,
  territoryId,
  currentStage,
}: {
  taskId: string;
  territoryId: string | null;
  /** The task's status, so its own stage is the one expanded by default. */
  currentStage?: TaskStage;
}) {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<TaskPhoto[]>([]);
  const [available, setAvailable] = useState(true);
  const [uploading, setUploading] = useState<TaskStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  function refresh() {
    listTaskPhotos([taskId])
      .then((rows) => {
        setPhotos(rows);
        setAvailable(true);
      })
      .catch(() => setAvailable(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!available) return null;

  async function upload(stage: TaskStage, file: File | undefined) {
    if (!file || !territoryId) return;
    setUploading(stage);
    setError(null);
    try {
      await addTaskPhoto({
        file,
        territory_id: territoryId,
        task_id: taskId,
        stage,
        uploaded_by: profile?.id ?? null,
      });
      refresh();
    } catch {
      // Uploads fail for boring reasons -- no signal in a hospital basement,
      // a HEIC the bucket rejects. Say so instead of appearing to do nothing.
      setError("Upload failed. Check your signal and try again.");
    } finally {
      setUploading(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteTaskPhoto(id);
    } catch {
      // The photo staying on screen is the honest outcome -- it is still
      // there. Silently refreshing would put it back with no explanation and
      // read as a bug rather than a failed delete.
      setError("Couldn't delete that photo. Check your signal and try again.");
    }
    refresh();
  }

  return (
    <div className="mt-2 space-y-2">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {STAGES.map((s) => {
        const shots = photos.filter((p) => p.stage === s.value);
        return (
          <div key={s.value}>
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] font-medium ${
                  currentStage === s.value ? "text-sky-300" : "text-slate-500"
                }`}
              >
                {s.label}
                {shots.length > 0 && ` · ${shots.length}`}
              </span>
              <button
                onClick={() => inputs.current[s.value]?.click()}
                disabled={uploading !== null || !territoryId}
                className="flex items-center gap-1 text-[11px] font-medium text-sky-400 disabled:opacity-50"
              >
                <Camera size={12} />
                {uploading === s.value ? "Uploading..." : "Add photo"}
              </button>
              <input
                ref={(el) => {
                  inputs.current[s.value] = el;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  upload(s.value, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            {shots.length > 0 && (
              <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
                {shots.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    <a href={p.url} target="_blank" rel="noreferrer">
                      <img
                        src={p.url}
                        alt={p.caption ?? `${s.label} photo`}
                        className="h-16 w-16 rounded-lg border border-slate-700 object-cover"
                      />
                    </a>
                    {p.uploaded_by === profile?.id && (
                      <button
                        onClick={() => remove(p.id)}
                        aria-label="Delete photo"
                        className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5 text-slate-400"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
