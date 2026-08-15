import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  FileStack,
  GraduationCap,
  NotebookPen,
  PackageSearch,
  Table2,
} from "lucide-react";

/**
 * The catalogue of systems Territory OS could talk to.
 *
 * This is a declaration, not an implementation. Nothing here connects to
 * anything: it exists so the Integrations screen can show what is possible,
 * what is actually wired, and -- honestly -- what is not built yet.
 *
 * `status` is the one field to be careful with. A provider marked `planned`
 * has no connector, and the UI must say so rather than offering a Test
 * Connection button that appears to succeed. An integration screen that lies
 * about a connection is worse than no integration screen, because the first
 * time it matters is the morning a rep trusts it about tomorrow's cases.
 *
 * To add a real connector:
 *   1. flip its entry here to `available`,
 *   2. register a handler in supabase/functions/integration-run,
 *   3. set its secret with `supabase secrets set <credentialRef>=...`.
 * See docs/integrations.md.
 */

export type ProviderAvailability =
  /** A connector exists and can be run. */
  | "available"
  /** Declared, no connector yet. Cannot be tested or synced. */
  | "planned"
  /** Works today, but through a manual step rather than a live connection. */
  | "manual";

export interface ProviderDefinition {
  provider: string;
  displayName: string;
  description: string;
  icon: LucideIcon;
  availability: ProviderAvailability;
  /** What it would bring in, in the app's own words. */
  brings: string[];
  /**
   * Name of the Supabase secret its connector will read. Null where the
   * provider needs no credential (a file the rep supplies by hand).
   */
  credentialRef: string | null;
  /** Where a rep does this today, when there is a manual route. */
  manualRoute?: { label: string; to: string };
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    provider: "myops",
    displayName: "myOPS",
    description:
      "Medacta's own system: the case schedule, loaner shipments and packing lists this territory already runs on.",
    icon: Table2,
    // Honest: there is no API connector. The CSV and paste importers are real
    // and used daily, so this is 'manual' rather than 'planned' -- the data
    // does arrive, a person just carries it.
    availability: "manual",
    brings: ["Cases", "Loaner shipments", "Set packing lists"],
    credentialRef: "MYOPS_API_TOKEN",
    manualRoute: { label: "Import a myOPS export", to: "/cases/new" },
  },
  {
    provider: "calendar",
    displayName: "Calendar",
    description:
      "Two-way with a real calendar so surgery blocks, travel and time off stop living in two places.",
    icon: CalendarClock,
    availability: "planned",
    brings: ["Surgery blocks", "Travel", "Time off"],
    credentialRef: "CALENDAR_OAUTH_TOKEN",
  },
  {
    provider: "shipments",
    displayName: "Shipment tracking",
    description:
      "Carrier tracking for inbound loaners and outbound returns, so a ship-by countdown reflects where the box actually is.",
    icon: PackageSearch,
    availability: "planned",
    brings: ["Inbound ETAs", "Return confirmations", "Exceptions"],
    credentialRef: "SHIPMENTS_API_TOKEN",
  },
  {
    provider: "evernote",
    displayName: "Evernote",
    description: "Historical notes worth pulling into the Knowledge layer.",
    icon: NotebookPen,
    availability: "planned",
    brings: ["Legacy notes"],
    credentialRef: "EVERNOTE_API_TOKEN",
  },
  {
    provider: "litmos",
    displayName: "Litmos",
    description: "Training and certification status, which compliance already tracks by hand.",
    icon: GraduationCap,
    availability: "planned",
    brings: ["Course completions", "Certification expiry"],
    credentialRef: "LITMOS_API_TOKEN",
  },
  {
    provider: "documents",
    displayName: "Document sources",
    description:
      "Technique guides, IFUs and product literature, so the Knowledge layer can cite a source instead of remembering one.",
    icon: FileStack,
    availability: "planned",
    brings: ["Technique guides", "IFUs", "Product literature"],
    credentialRef: "DOCUMENTS_API_TOKEN",
  },
];

export function findProvider(provider: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.provider === provider);
}

/** Only an `available` provider can be tested or synced from the UI. */
export function canRun(def: ProviderDefinition | undefined): boolean {
  return def?.availability === "available";
}
