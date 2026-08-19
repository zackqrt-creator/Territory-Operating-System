import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { listCaseTemplatesWithItems } from "../lib/api";
import type { CaseTemplateWithItems } from "../lib/types";
import CaseTemplateEditor from "../components/CaseTemplateEditor";

/**
 * What each case type actually needs — the templates Readiness, Staging, and
 * Pack List all read from. Previously hand-seeded per procedure through a SQL
 * migration; this is the app-side editor for the same data.
 */
export default function Procedures() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<CaseTemplateWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ template: CaseTemplateWithItems | null } | null>(null);

  function refresh() {
    setLoading(true);
    return listCaseTemplatesWithItems()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
  }, []);

  const knees = templates.filter((t) => t.surgery_type === "KNEE");
  const hips = templates.filter((t) => t.surgery_type === "HIP");

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Procedures</h1>
        <button
          onClick={() => setEditing({ template: null })}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        What each case type needs — implants, trays, loaners. Readiness, Staging, and Pack List all
        check against this.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : templates.length === 0 ? (
        <p className="mt-8 text-slate-500">No procedures defined yet.</p>
      ) : (
        <div className="mt-5 space-y-6">
          <TemplateGroup title="Knee" templates={knees} onEdit={(t) => setEditing({ template: t })} />
          <TemplateGroup title="Hip" templates={hips} onEdit={(t) => setEditing({ template: t })} />
        </div>
      )}

      {editing && (
        <CaseTemplateEditor
          template={editing.template}
          territoryId={profile?.territory_id ?? null}
          onClose={() => setEditing(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function TemplateGroup({
  title,
  templates,
  onEdit,
}: {
  title: string;
  templates: CaseTemplateWithItems[];
  onEdit: (t: CaseTemplateWithItems) => void;
}) {
  if (templates.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2 space-y-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => onEdit(t)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-left active:bg-slate-800"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-100">
                {t.name}
                <span className="ml-1.5 text-xs font-normal capitalize text-slate-500">
                  {t.variant}
                </span>
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {t.case_template_items.length} requirement{t.case_template_items.length === 1 ? "" : "s"}
                {t.alt_name ? ` · aka ${t.alt_name}` : ""}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
