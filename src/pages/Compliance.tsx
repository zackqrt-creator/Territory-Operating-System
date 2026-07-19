import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  createFacilityCredential,
  createRepCertification,
  listFacilities,
  listFacilityCredentials,
  listProfiles,
  listRepCertifications,
  listUpcomingCases,
} from "../lib/api";
import type { CaseRow, Facility, FacilityCredential, Profile, RepCertification } from "../lib/types";
import { credentialConflicts } from "../lib/crm";
import { daysUntil, formatDateShort, toISODate } from "../utils/dates";

/**
 * Compliance: rep certifications + facility credentialing (RepTrax/Symplr).
 * The door-check cross-references credential expiries against upcoming cases
 * at that facility — catch "turned away at the door" before it happens.
 */
export default function Compliance() {
  const { profile } = useAuth();
  const [certs, setCerts] = useState<RepCertification[]>([]);
  const [creds, setCreds] = useState<FacilityCredential[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [certName, setCertName] = useState("");
  const [certExpires, setCertExpires] = useState("");
  const [credVendor, setCredVendor] = useState("");
  const [credFacility, setCredFacility] = useState("");
  const [credExpires, setCredExpires] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    return Promise.all([
      listRepCertifications(),
      listFacilityCredentials(),
      listFacilities(),
      listProfiles(),
      listUpcomingCases(),
    ]).then(([rc, fc, f, p, c]) => {
      setCerts(rc);
      setCreds(fc);
      setFacilities(f);
      setProfiles(p);
      setCases(c);
    });
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const nameOf = (id: string) =>
    id === profile?.id ? "You" : (profiles.find((p) => p.id === id)?.display_name ?? "?");
  const facilityName = (id: string) => facilities.find((f) => f.id === id)?.name ?? "?";
  const conflicts = credentialConflicts(creds, cases, facilities, profiles, toISODate(new Date()));

  async function addCert() {
    if (!certName.trim() || !profile) return;
    setSaving(true);
    try {
      await createRepCertification({
        profile_id: profile.id,
        name: certName.trim(),
        expires_on: certExpires || null,
        territory_id: profile.territory_id,
      });
      setCertName("");
      setCertExpires("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function addCred() {
    if (!credVendor.trim() || !credFacility || !credExpires || !profile) return;
    setSaving(true);
    try {
      await createFacilityCredential({
        profile_id: profile.id,
        facility_id: credFacility,
        vendor: credVendor.trim(),
        expires_on: credExpires,
        territory_id: profile.territory_id,
      });
      setCredVendor("");
      setCredExpires("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  function expiryTone(iso: string | null) {
    if (!iso) return "text-slate-500";
    const d = daysUntil(iso);
    return d < 0 ? "text-red-300" : d <= 30 ? "text-amber-300" : "text-slate-400";
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-white">Compliance</h1>
      <p className="mt-1 text-sm text-slate-400">
        Rep certifications and facility credentialing (RepTrax, Symplr…), cross-checked against
        your scheduled cases so an expired badge never surprises you at the door.
      </p>

      {loading ? (
        <p className="mt-8 text-slate-400">Loading...</p>
      ) : (
        <>
          {conflicts.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-800 bg-red-950/40 p-4">
              <h2 className="text-sm font-semibold text-red-200">🚪 Door-check alerts</h2>
              <div className="mt-2 space-y-1.5">
                {conflicts.map((c) => (
                  <p key={c.credential.id} className="text-sm text-red-100">
                    {c.rep ? nameOf(c.rep.id) : "A rep"}'s {c.credential.vendor} at{" "}
                    {c.facility.name} expires {formatDateShort(c.credential.expires_on)} — before
                    the {formatDateShort(c.firstAffectedCase.surgery_date)} case there. Renew it.
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <h2 className="font-semibold text-white">Facility credentials</h2>
            {creds.length === 0 && (
              <p className="mt-1 text-sm text-slate-500">None on file yet.</p>
            )}
            <div className="mt-2 space-y-1.5">
              {creds.map((c) => (
                <p key={c.id} className="text-sm text-slate-300">
                  {nameOf(c.profile_id)} · {c.vendor} @ {facilityName(c.facility_id)} —{" "}
                  <span className={expiryTone(c.expires_on)}>
                    expires {formatDateShort(c.expires_on)}
                  </span>
                </p>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <input
                value={credVendor}
                onChange={(e) => setCredVendor(e.target.value)}
                placeholder="RepTrax"
                className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <select
                value={credFacility}
                onChange={(e) => setCredFacility(e.target.value)}
                className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
              >
                <option value="">Facility…</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={credExpires}
                onChange={(e) => setCredExpires(e.target.value)}
                className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
              />
            </div>
            <button
              onClick={addCred}
              disabled={saving || !credVendor.trim() || !credFacility || !credExpires}
              className="mt-2 w-full rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add my credential
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <h2 className="font-semibold text-white">Rep certifications</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Product/system training. These feed each case's readiness score.
            </p>
            {certs.length === 0 && <p className="mt-1 text-sm text-slate-500">None on file yet.</p>}
            <div className="mt-2 space-y-1.5">
              {certs.map((c) => (
                <p key={c.id} className="text-sm text-slate-300">
                  {nameOf(c.profile_id)} · {c.name} —{" "}
                  <span className={expiryTone(c.expires_on)}>
                    {c.expires_on ? `expires ${formatDateShort(c.expires_on)}` : "no expiry set"}
                  </span>
                </p>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                value={certName}
                onChange={(e) => setCertName(e.target.value)}
                placeholder="GMK Sphere certification"
                className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <input
                type="date"
                value={certExpires}
                onChange={(e) => setCertExpires(e.target.value)}
                className="min-h-0 rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
              />
            </div>
            <button
              onClick={addCert}
              disabled={saving || !certName.trim()}
              className="mt-2 w-full rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add my certification
            </button>
          </div>
        </>
      )}
    </div>
  );
}
