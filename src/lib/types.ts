export type FacilityType = "storage" | "surgery_center" | "hospital" | "corporate" | "vehicle";

export interface Facility {
  id: string;
  territory_id: string;
  name: string;
  type: FacilityType;
  address: string | null;
  /** Rarely-touch reserve storage (e.g. Lodi) — withdrawals get flagged red across the app. */
  alert_on_withdrawal: boolean;
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
  created_at: string;
}

export type ItemCategory = "loaner_kit" | "instrument_tray" | "implant" | "consumable";

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
  created_at: string;
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
}

export interface CaseTemplateWithItems extends CaseTemplate {
  case_template_items: CaseTemplateItem[];
}

export type CatalogSide = "LEFT" | "RIGHT" | "NA";
export type CementType = "cemented" | "cementless" | "NA";

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
