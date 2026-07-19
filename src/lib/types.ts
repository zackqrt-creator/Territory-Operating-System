export type FacilityType = "storage" | "surgery_center" | "hospital" | "corporate" | "vehicle";

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
}

export interface CaseTemplateWithItems extends CaseTemplate {
  case_template_items: CaseTemplateItem[];
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
  done_at: string | null;
  created_at: string;
}

export type NoteEntityType = "case" | "inventory_item" | "surgeon" | "facility";

export interface EntityNote {
  id: string;
  territory_id: string;
  author_id: string | null;
  entity_type: NoteEntityType;
  entity_id: string;
  body: string;
  created_at: string;
  updated_at: string | null;
}
