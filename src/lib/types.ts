export type FacilityType = "storage" | "surgery_center" | "hospital" | "corporate" | "vehicle";

export interface Facility {
  id: string;
  territory_id: string;
  name: string;
  type: FacilityType;
  address: string | null;
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
