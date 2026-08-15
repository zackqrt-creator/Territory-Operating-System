export type FacilityType =
  | "storage"
  | "surgery_center"
  | "hospital"
  | "corporate"
  | "vehicle"
  | "sterile_processing"
  | "warehouse";

export type TrackedAssetKind = "kaone_set" | "revision_tote";

export type AssetStatus =
  | "available"
  | "at_hospital"
  | "in_surgery"
  | "awaiting_pickup"
  | "sterile_processing"
  | "in_transit";

export interface TrackedAsset {
  id: string;
  territory_id: string;
  kind: TrackedAssetKind;
  code: string;
  label: string | null;
  location_id: string | null;
  status: AssetStatus;
  available_date: string | null;
  assigned_case_id: string | null;
  /** Seeded shell — location/details not yet human-confirmed; UI flags it. */
  is_placeholder: boolean;
  notes: string | null;
  created_at: string;
}

export interface AssetMovement {
  id: string;
  territory_id: string;
  asset_id: string;
  from_location: string | null;
  to_location: string | null;
  status_after: AssetStatus | null;
  moved_by: string | null;
  related_case_id: string | null;
  note: string | null;
  created_at: string;
}

export interface Facility {
  id: string;
  territory_id: string;
  name: string;
  type: FacilityType;
  address: string | null;
  /** Rarely-touch reserve storage (e.g. Lodi) — withdrawals get flagged red across the app. */
  alert_on_withdrawal: boolean;
  /** Lower = pull from here first when sourcing a shortfall. Reserve sits high (~90). */
  sourcing_priority: number;
}

export interface Profile {
  id: string;
  territory_id: string;
  display_name: string;
  role: "rep" | "lead";
  last_facility_id: string | null;
}

export type SurgeryType = "KNEE" | "HIP" | "INSTRUMENT";
export type Side = "LEFT" | "RIGHT";
export type CaseStatus = "scheduled" | "completed" | "cancelled";
export type CaseVariant = "total" | "partial";

export interface CaseRow {
  id: string;
  territory_id: string;
  case_id: string | null;
  surgery_type: SurgeryType;
  side: Side | null;
  surgery_date: string; // YYYY-MM-DD
  time_tba: boolean;
  surgery_time: string | null;
  facility_id: string | null;
  surgeon: string | null;
  surgeon_id: string | null;
  status: CaseStatus;
  notes: string | null;
  variant: CaseVariant | null;
  template_id: string | null;
  created_by: string | null;
  /** Rep covering the case (falls back to created_by for scoring). */
  assigned_rep_id: string | null;
  purchase_order_no: string | null;
  invoice_no: string | null;
  billing_status: BillingStatus;
  /** When the billing stage last moved; null until the first change. */
  billing_updated_at: string | null;
  created_at: string;
}

export interface TimeOff {
  id: string;
  territory_id: string;
  rep_id: string;
  start_date: string; // YYYY-MM-DD inclusive
  end_date: string; // YYYY-MM-DD inclusive
  reason: string | null;
  created_at: string;
}

export type BillingStatus = "none" | "awaiting_po" | "po_received" | "invoiced" | "paid";

export type ItemCategory = "loaner_kit" | "instrument_tray" | "implant" | "consumable";
export type AcquisitionType = "consignment" | "loaner";

export interface InventoryItem {
  id: string;
  territory_id: string;
  name: string;
  category: ItemCategory;
  lot_number: string | null;
  barcode_value: string | null;
  location_id: string;
  quantity: number;
  expiration_date: string | null;
  loaner_return_deadline: string | null;
  return_extended_until: string | null;
  return_extension_reason: string | null;
  assigned_case_id: string | null;
  catalog_item_id: string | null;
  photo_url: string | null;
  /** How this unit is held: owned consignment stock vs a borrowed loaner. */
  acquisition_type: AcquisitionType;
  /** For loaner tote contents: the inventory id of the tote they came in. */
  loaner_tote_id: string | null;
  /** On a loaner tote row: the outer code printed on the tote (e.g. SPKAEFFR08). */
  loaner_code: string | null;
  /** On a loaner tote row: what's inside, in plain terms (e.g. "Ins-Spherika Efficiency Right"). */
  contents_label: string | null;
  /** Femur cement variant, when it applies. */
  cement_type: "cemented" | "cementless" | null;
  /** Instrument trays only. 'unknown' = not tracked, never treated as sterile. */
  sterilization_status: SterilizationStatus;
  sterilization_expires_at: string | null;
  /** Inbound loaners only. */
  delivery_status: DeliveryStatus | null;
  expected_delivery_date: string | null;
  created_at: string;
}

export type SterilizationStatus = "sterile" | "processing" | "expired" | "unknown";
export type DeliveryStatus = "ordered" | "in_transit" | "delivered";

export type InventoryReceiptStatus = "draft" | "posted" | "voided";
export type InventoryReceiptSource = "company_shipment" | "loaner" | "transfer" | "return" | "other";

export interface InventoryReceipt {
  id: string;
  territory_id: string;
  receiving_location_id: string;
  status: InventoryReceiptStatus;
  source_type: InventoryReceiptSource;
  vendor_name: string | null;
  packing_slip_number: string | null;
  tracking_number: string | null;
  received_at: string;
  received_by: string;
  notes: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Movement {
  id: string;
  territory_id: string;
  item_id: string;
  from_location: string | null;
  to_location: string;
  moved_by: string | null;
  related_case_id: string | null;
  note: string | null;
  tracking_number: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export interface CaseTemplate {
  id: string;
  territory_id: string;
  name: string;
  surgery_type: "KNEE" | "HIP";
  variant: CaseVariant;
}

export interface CaseTemplateItem {
  id: string;
  template_id: string;
  category: ItemCategory;
  name: string;
  quantity: number;
  /**
   * Which operative side this line applies to. 'ANY' is the default and means
   * every case of this type needs it; 'LEFT'/'RIGHT' lines drop off cases for
   * the other side, so a right knee never asks for the left complete tote.
   */
  applies_to_side: Side | "ANY";
}

/**
 * A checklist line a rep ticked by hand because the item is genuinely there but
 * the catalog does not know about it yet.
 *
 * Never inventory: marks clear one line on one case and nothing else. They do
 * not create stock, deduct anything, or reach the pack list.
 */
export interface CaseChecklistMark {
  id: string;
  territory_id: string;
  case_id: string;
  /** The checklist line, as `category|name`. */
  item_key: string;
  note: string | null;
  marked_by: string | null;
  created_at: string;
}

export interface CaseTemplateWithItems extends CaseTemplate {
  case_template_items: CaseTemplateItem[];
}

/**
 * Something that travels on a surgery day regardless of how many cases are on
 * it -- the revision totes, spare efficiency kits. Counted once per day, not
 * once per case, which is the whole reason it is not a `CaseTemplateItem`.
 */
export interface DayRequirement {
  id: string;
  territory_id: string;
  /** 'ANY' means every surgery day, whatever the joint. */
  surgery_type: "KNEE" | "HIP" | "INSTRUMENT" | "ANY";
  category: ItemCategory;
  name: string;
  quantity: number;
  note: string | null;
  sort_order: number;
  created_at: string;
}

export interface DayChecklistMark {
  id: string;
  territory_id: string;
  /** ISO date the line was ticked for. */
  on_date: string;
  /** The line, as `category|name`. */
  item_key: string;
  note: string | null;
  marked_by: string | null;
  created_at: string;
}

export type CatalogSide = "LEFT" | "RIGHT" | "NA";
export type CementType = "cemented" | "cementless" | "NA";
export type CatalogJoint = "KNEE" | "HIP" | "NA";

export interface CatalogItem {
  id: string;
  territory_id: string;
  item_number: string | null;
  name: string;
  category: ItemCategory;
  product_line: string | null;
  side: CatalogSide | null;
  size_label: string | null;
  cement_type: CementType | null;
  joint: CatalogJoint;
  /** Free-text device grouping, e.g. "Femoral Stem", "Acetabular Cup", "Bone Cement". */
  device_type: string | null;
  /** GTIN decoded from a scanned barcode (GS1 AI 01) — what a barcode scan actually identifies, vs item_number/REF which OCR reads off the printed label. Learned the first time a rep matches a scanned GTIN to this item. */
  gtin: string | null;
  equivalent_loaner_code: string | null;
  created_at: string;
}

export interface Surgeon {
  id: string;
  territory_id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface ToteTemplate {
  id: string;
  territory_id: string;
  name: string;
  /** myOPS Set code (GSKAIMPL, 500KATRL...). Added in migration 026. */
  code?: string | null;
  /** 'implant' | 'instrument' — which kind of tray this Set is. */
  content_type?: string | null;
  /** true = instrument-type tote that gets resterilized/reused between cases (soft advisory). */
  reusable: boolean;
  advisory_cases_per_unit: number | null;
  notes: string | null;
  created_at: string;
}

export interface ToteTemplateItem {
  id: string;
  tote_template_id: string;
  catalog_item_id: string;
  quantity_per_tote: number;
  /** Physical packing order (1, 2, 3...) so the pack list can match how you actually load the tote. */
  pack_layer: number | null;
}

export interface ToteTemplateWithItems extends ToteTemplate {
  tote_template_items: (ToteTemplateItem & { catalog_item: CatalogItem })[];
}

export interface SurgeonPreference {
  id: string;
  surgeon_id: string;
  territory_id: string;
  surgery_type: "KNEE" | "HIP";
  variant: CaseVariant;
  alignment_technique: string | null;
  cement_type: CementType | null;
  instrument_tote_id: string | null;
  implant_tote_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface SurgeonPreferenceWithTotes extends SurgeonPreference {
  instrument_tote: ToteTemplateWithItems | null;
  implant_tote: ToteTemplateWithItems | null;
}

export type BoardPostKind = "note" | "todo";

export type BoardCategory = "general" | "inventory" | "cases" | "schedule";

export interface BoardPost {
  id: string;
  territory_id: string;
  author_id: string | null;
  body: string;
  kind: BoardPostKind;
  category: BoardCategory;
  assignee_id: string | null;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
  mentioned_ids: string[];
  /** Stays at the top of the wall; any teammate can pin/unpin. */
  pinned: boolean;
  /** Profile ids that tapped "seen it" on this post. */
  acked_by: string[];
  created_at: string;
}

export interface BoardComment {
  id: string;
  territory_id: string;
  post_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface RepCertification {
  id: string;
  territory_id: string;
  profile_id: string;
  name: string;
  issued_on: string | null;
  expires_on: string | null;
  created_at: string;
}

export interface CaseItemPlan {
  id: string;
  territory_id: string;
  case_id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  source: "suggested" | "manual";
  created_at: string;
}

export interface QaQuestion {
  id: string;
  territory_id: string;
  author_id: string | null;
  body: string;
  pinned_product: string | null;
  pinned_surgeon_id: string | null;
  pinned_surgery_type: "KNEE" | "HIP" | null;
  created_at: string;
}

export interface QaAnswer {
  id: string;
  territory_id: string;
  question_id: string;
  author_id: string | null;
  body: string;
  accepted: boolean;
  created_at: string;
}

export interface FacilityCredential {
  id: string;
  territory_id: string;
  profile_id: string;
  facility_id: string;
  vendor: string;
  expires_on: string;
  created_at: string;
}

export type TaskStatus = "todo" | "doing" | "done";

export interface PersonalTask {
  id: string;
  territory_id: string;
  owner_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  status: TaskStatus;
  /** Profile ids this task is shared with; empty = private to the owner. */
  shared_with: string[];
  /** Teammate this task is delegated to; null = the owner's own task. */
  assigned_to: string | null;
  /** Entity note this task was spawned from ("Follow up" on a note). */
  source_note_id: string | null;
  /** Optional link to any record this task is about. */
  entity_type: NoteEntityType | null;
  entity_id: string | null;
  done_at: string | null;
  created_at: string;
}

/**
 * Anything a note or a task can hang off. Kept identical to the check
 * constraints in migration 048 -- when this list and the database's list drift,
 * whole sections of the app silently lose the ability to be annotated, which is
 * exactly what happened to catalog items and Sets.
 */
export type NoteEntityType =
  | "case"
  | "inventory_item"
  | "surgeon"
  | "facility"
  | "catalog_item"
  | "tote_template"
  | "case_template"
  | "movement"
  | "calendar_block"
  | "task"
  | "note"
  | "territory";

export interface EntityNote {
  id: string;
  territory_id: string;
  author_id: string | null;
  entity_type: NoteEntityType;
  entity_id: string;
  body: string;
  /** Floats to the top of its thread; author-controlled. */
  pinned: boolean;
  created_at: string;
  updated_at: string | null;
}

/** Canonical-page-eligible records — each gets at most one wiki page. */
export type PageEntityType = "surgeon" | "facility" | "tote_template" | "catalog_item";

// ---- Territory notes / second brain ---------------------------------------

export type TerritoryNoteType =
  | "general"
  | "case"
  | "hospital"
  | "inventory"
  | "replenishment"
  | "logistics"
  | "playbook"
  | "loaner"
  | "consignment"
  | "surgeon"
  | "task"
  | "meeting"
  | "idea"
  | "ai_summary";

export type TerritoryNoteVisibility = "private" | "team" | "territory_admin";

export type TerritoryNoteSource =
  | "manual"
  | "mobile"
  | "sticker_photo"
  | "calendar_import"
  | "catalog_import"
  | "ai_generated"
  | "system";

export type SecondBrainStatus = "pending" | "ready" | "synced" | "ignored" | "needs_review";

/** Records a note can link to. Mirrors entity_notes' set plus the catalog module. */
export type TerritoryNoteEntityType =
  | "case"
  | "facility"
  | "surgeon"
  | "inventory_item"
  | "catalog_item"
  | "tote_template"
  | "case_template";

export type NoteLinkRelationship =
  | "related"
  | "about"
  | "decision"
  | "issue"
  | "follow_up"
  | "used_in"
  | "needed_for"
  | "source"
  | "result";

export interface TerritoryNote {
  id: string;
  territory_id: string;
  created_by: string | null;
  owner_id: string | null;
  title: string;
  body: string;
  note_type: TerritoryNoteType;
  visibility: TerritoryNoteVisibility;
  source: TerritoryNoteSource;
  occurred_at: string | null;
  pinned: boolean;
  archived: boolean;
  ai_summary: string | null;
  ai_action_items: unknown[];
  ai_entities: Record<string, unknown>;
  second_brain_status: SecondBrainStatus;
  second_brain_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface TerritoryNoteLink {
  id: string;
  territory_id: string;
  note_id: string;
  entity_type: TerritoryNoteEntityType;
  entity_id: string;
  relationship: NoteLinkRelationship;
  created_by: string | null;
  created_at: string;
}

export interface TerritoryNoteTag {
  id: string;
  territory_id: string;
  name: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
}

/** A note as returned by the territory_note_feed view: links/tags pre-aggregated. */
export interface TerritoryNoteFeedItem extends TerritoryNote {
  links: Array<{ entity_type: TerritoryNoteEntityType; entity_id: string; relationship: NoteLinkRelationship }>;
  tags: Array<{ id: string; name: string; color: string | null }>;
}

export interface WikiPage {
  id: string;
  territory_id: string;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  entity_type: PageEntityType | null;
  entity_id: string | null;
  pinned: boolean;
  created_by: string | null;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageLink {
  id: string;
  territory_id: string;
  source_page_id: string;
  target_page_id: string | null;
  target_title: string;
  created_at: string;
}

export type CaseAssigneeRole = "primary" | "covering" | "observing";

/** A second (or third) rep attached to a case — coverage, backup, training. */
export interface CaseAssignee {
  id: string;
  territory_id: string;
  case_id: string;
  profile_id: string;
  role: CaseAssigneeRole;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type CalendarBlockKind =
  | "hospital_visit"
  | "in_service"
  | "travel"
  | "admin"
  | "personal"
  | "other";

/** Anything on the calendar that isn't a surgical case: visits, travel, admin. */
export interface CalendarBlock {
  id: string;
  territory_id: string;
  rep_id: string;
  block_date: string;
  start_time: string;
  end_time: string | null;
  label: string;
  kind: CalendarBlockKind;
  facility_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type TaskStage = "todo" | "doing" | "done";

/** A photo attached to a task, filed under the stage it documents. */
export interface TaskPhoto {
  id: string;
  territory_id: string;
  task_id: string;
  stage: TaskStage;
  url: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** A photo attached to a territory note — a tray, a label, a shelf, whatever the note is about. */
export interface NotePhoto {
  id: string;
  territory_id: string;
  note_id: string;
  url: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** A photo attached to a Knowledge page. */
export interface PagePhoto {
  id: string;
  territory_id: string;
  page_id: string;
  url: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/**
 * What a photo of a tray is showing.
 *
 * 'label' is the outside label — which tray this is. 'layer' is one layer of
 * the inside, so the molded slots can be restored exactly. A two-layer tray is
 * three photos: the label and both layers.
 */
export type AssetPhotoKind = "label" | "layer";

/**
 * A photo of how a tray was packed. Attached either to a loaner tote (an
 * inventory item) or to a reusable set (a tracked asset) — exactly one.
 */
export interface AssetPhoto {
  id: string;
  territory_id: string;
  inventory_item_id: string | null;
  tracked_asset_id: string | null;
  /** A Set/Tote template's own reference photo — "what a correct one looks like", not tied to one physical unit. */
  tote_template_id: string | null;
  kind: AssetPhotoKind;
  /** 1-based, top layer first. Null for a label photo. */
  layer_index: number | null;
  url: string;
  caption: string | null;
  /** True when taken at intake, before anything was removed. */
  as_received: boolean;
  uploaded_by: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ *
 * Daily manager report
 *
 * A one-way artifact. Territory Operations stays private; a report is
 * hand-curated by the rep and leaves the building as text or PDF, never as
 * access. Every field here is something the rep chose to say.
 * ------------------------------------------------------------------ */

export type DailyReportStatus = "draft" | "ready" | "sent" | "acknowledged" | "archived";
export type DailyReportSendMethod = "email" | "text" | "pdf" | "verbal" | "other";

export type DailyReportSection =
  | "completed"
  | "equipment"
  | "outstanding"
  | "manager_request"
  | "tomorrow"
  | "guidance";

export type DailyReportItemStatus = "complete" | "in_progress" | "pending" | "needs_attention";
export type DailyReportPriority = "high" | "normal" | "low";

/** Where a line was drawn from, so the rep does not retype what already exists. */
export type DailyReportSourceType =
  | "task"
  | "case"
  | "inventory_item"
  | "tracked_asset"
  | "note"
  | "movement";

export interface DailyReport {
  id: string;
  territory_id: string;
  author_id: string;
  /** YYYY-MM-DD. One report per rep per day. */
  report_date: string;
  area: string | null;
  summary: string | null;
  important_notes: string | null;
  status: DailyReportStatus;
  sent_at: string | null;
  sent_to: string | null;
  sent_method: DailyReportSendMethod | null;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  /** Frozen text of what was actually sent, so later edits cannot rewrite it. */
  sent_snapshot: DailyReportSnapshot | null;
  created_at: string;
  updated_at: string;
}

/** What `sent_snapshot` holds: the generated output, exactly as it went out. */
export interface DailyReportSnapshot {
  generated_at: string;
  full: string;
  text_message: string;
}

export interface DailyReportItem {
  id: string;
  territory_id: string;
  report_id: string;
  section: DailyReportSection;
  position: number;
  title: string;
  detail: string | null;
  status: DailyReportItemStatus | null;
  category: string | null;
  next_action: string | null;
  expected_date: string | null;
  priority: DailyReportPriority | null;
  location_id: string | null;
  quantity: number | null;
  occurred_at: string | null;
  planned_time: string | null;
  source_type: DailyReportSourceType | null;
  source_id: string | null;
  created_at: string;
}

export interface DailyReportPhoto {
  id: string;
  territory_id: string;
  report_id: string;
  url: string;
  caption: string | null;
  source_type: "task_photo" | "asset_photo" | "upload" | null;
  source_id: string | null;
  position: number;
  created_at: string;
}

/** A report and everything on it, which is how every screen wants it. */
export interface DailyReportFull extends DailyReport {
  items: DailyReportItem[];
  photos: DailyReportPhoto[];
}

/**
 * Kinds of work a completed or planned line can be. Free text in the database
 * so a rep is never blocked by a missing option, but offered as a list because
 * consistent labels are what make a week of reports comparable.
 */
export const DAILY_REPORT_CATEGORIES = [
  "Case support",
  "Hospital / ASC visit",
  "Delivery",
  "Efficiency totes",
  "Instruments / equipment",
  "Inventory",
  "Replenishment",
  "Surgeon / staff support",
  "Administrative",
  "Other",
] as const;

/* ------------------------------------------------------------------ *
 * Integration framework
 *
 * Plumbing for future connections to myOPS, calendars, shipment tracking,
 * document sources and so on. No connector is implemented yet; these are the
 * shapes one plugs into.
 *
 * `config` is NON-SECRET settings only and `credential_ref` is the NAME of a
 * Supabase secret, never its value -- anything this app can read, a browser can
 * read. See migration 054 and supabase/functions/link-note for the precedent.
 * ------------------------------------------------------------------ */

export type IntegrationStatus = "not_configured" | "connected" | "error" | "disabled";
export type IntegrationRunKind = "test" | "sync" | "backfill";
export type IntegrationRunTrigger = "manual" | "scheduled" | "webhook";
export type IntegrationRunStatus = "running" | "success" | "error" | "partial";

export interface Integration {
  id: string;
  territory_id: string;
  /** Stable machine name: 'myops', 'google_calendar', 'shipments'… */
  provider: string;
  display_name: string;
  enabled: boolean;
  status: IntegrationStatus;
  /** Non-secret settings only. */
  config: Record<string, unknown>;
  /** Name of a Supabase secret, e.g. "MYOPS_API_TOKEN". Never the secret. */
  credential_ref: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  /** Connector-defined resume point for incremental sync. */
  sync_cursor: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationRun {
  id: string;
  territory_id: string;
  integration_id: string;
  kind: IntegrationRunKind;
  trigger: IntegrationRunTrigger;
  status: IntegrationRunStatus;
  started_at: string;
  finished_at: string | null;
  items_seen: number;
  items_created: number;
  items_updated: number;
  items_skipped: number;
  error_message: string | null;
  error_detail: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  created_by: string | null;
}

/** Maps an outside system's record id to a row in this database. */
export interface IntegrationLink {
  id: string;
  territory_id: string;
  integration_id: string;
  external_kind: string;
  external_id: string;
  external_updated_at: string | null;
  payload_hash: string | null;
  entity_type: string;
  entity_id: string;
  created_at: string;
  updated_at: string;
}

/** An integration plus its most recent run, which is what every screen wants. */
export interface IntegrationWithRun extends Integration {
  latest_run: IntegrationRun | null;
}
