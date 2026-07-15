import { supabase } from "./supabase";
import type {
  CaseRow,
  CaseTemplateWithItems,
  CatalogItem,
  Facility,
  InventoryItem,
  ItemCategory,
  Movement,
  Profile,
  Surgeon,
  SurgeonPreference,
  ToteTemplateWithItems,
} from "./types";

export async function listFacilities(): Promise<Facility[]> {
  const { data, error } = await supabase.from("facilities").select("*").order("name");
  if (error) throw error;
  return data as Facility[];
}

export async function listUpcomingCases(): Promise<CaseRow[]> {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .neq("status", "cancelled")
    .order("surgery_date", { ascending: true });
  if (error) throw error;
  return data as CaseRow[];
}

export async function listCasesInRange(startISO: string, endISO: string): Promise<CaseRow[]> {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .gte("surgery_date", startISO)
    .lte("surgery_date", endISO)
    .order("surgery_date", { ascending: true })
    .order("surgery_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as CaseRow[];
}

export async function listCaseTemplatesWithItems(): Promise<CaseTemplateWithItems[]> {
  const { data, error } = await supabase.from("case_templates").select("*, case_template_items(*)");
  if (error) throw error;
  return data as CaseTemplateWithItems[];
}

export interface NewCaseInput {
  case_id?: string | null;
  surgery_type: "KNEE" | "HIP" | "INSTRUMENT";
  side?: "LEFT" | "RIGHT" | null;
  surgery_date: string;
  surgery_time?: string | null;
  time_tba?: boolean;
  variant?: "total" | "partial" | null;
  facility_id: string;
  surgeon?: string | null;
  surgeon_id?: string | null;
  notes?: string | null;
  territory_id: string;
  created_by: string;
}

export async function createCase(input: NewCaseInput): Promise<CaseRow> {
  const { data, error } = await supabase.from("cases").insert(input).select().single();
  if (error) throw error;
  return data as CaseRow;
}

export interface BulkCaseInput extends NewCaseInput {}

/** Inserts many cases, skipping ones whose case_id already exists in this territory. */
export async function bulkCreateCases(
  inputs: BulkCaseInput[],
): Promise<{ inserted: number; skipped: number }> {
  const withIds = inputs.filter((c) => c.case_id);
  const caseIds = withIds.map((c) => c.case_id as string);

  let existing = new Set<string>();
  if (caseIds.length > 0) {
    const { data, error } = await supabase.from("cases").select("case_id").in("case_id", caseIds);
    if (error) throw error;
    existing = new Set((data ?? []).map((r) => r.case_id as string));
  }

  const toInsert = inputs.filter((c) => !c.case_id || !existing.has(c.case_id));
  const skipped = inputs.length - toInsert.length;
  if (toInsert.length === 0) return { inserted: 0, skipped };

  const { error: insertError } = await supabase.from("cases").insert(toInsert);
  if (insertError) throw insertError;
  return { inserted: toInsert.length, skipped };
}

export async function listInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase.from("inventory_items").select("*").order("name");
  if (error) throw error;
  return data as InventoryItem[];
}

export async function findItemByBarcode(barcode: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("barcode_value", barcode)
    .maybeSingle();
  if (error) throw error;
  return data as InventoryItem | null;
}

export interface NewItemInput {
  name: string;
  category: InventoryItem["category"];
  lot_number?: string | null;
  barcode_value?: string | null;
  location_id: string;
  quantity?: number;
  expiration_date?: string | null;
  loaner_return_deadline?: string | null;
  territory_id: string;
  catalog_item_id?: string | null;
}

export async function createInventoryItem(input: NewItemInput): Promise<InventoryItem> {
  const { data, error } = await supabase.from("inventory_items").insert(input).select().single();
  if (error) throw error;
  return data as InventoryItem;
}

/** Moves an item to a new location and writes the immutable movement record. */
export async function moveItem(params: {
  item: InventoryItem;
  toLocation: string;
  movedBy: string;
  territoryId: string;
  relatedCaseId?: string | null;
  note?: string | null;
  /** True when the destination is the corporate facility: clears the loaner
   * return clock (deadline, any extension, case assignment) since the
   * return cycle is complete for this unit. */
  returningToCorporate?: boolean;
}): Promise<void> {
  const { item, toLocation, movedBy, territoryId, relatedCaseId, note, returningToCorporate } = params;

  const { error: moveError } = await supabase.from("movements").insert({
    territory_id: territoryId,
    item_id: item.id,
    from_location: item.location_id,
    to_location: toLocation,
    moved_by: movedBy,
    related_case_id: relatedCaseId ?? null,
    note: note ?? null,
  });
  if (moveError) throw moveError;

  const update: Record<string, unknown> = { location_id: toLocation };
  if (returningToCorporate) {
    update.loaner_return_deadline = null;
    update.return_extended_until = null;
    update.return_extension_reason = null;
    update.assigned_case_id = null;
  }

  const { error: updateError } = await supabase.from("inventory_items").update(update).eq("id", item.id);
  if (updateError) throw updateError;
}

export async function listRecentMovements(limit = 100): Promise<Movement[]> {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as Movement[];
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*");
  if (error) throw error;
  return data as Profile[];
}

export async function listCasesByIds(ids: string[]): Promise<CaseRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("cases").select("*").in("id", ids);
  if (error) throw error;
  return data as CaseRow[];
}

export async function listMovementsForItem(itemId: string): Promise<Movement[]> {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Movement[];
}

export async function updateLastFacility(profileId: string, facilityId: string): Promise<void> {
  await supabase.from("profiles").update({ last_facility_id: facilityId }).eq("id", profileId);
}

export interface UsedItem {
  category: ItemCategory;
  name: string;
  quantity: number;
}

/**
 * Post-case quick log: decrements inventory for whatever was used, consuming
 * the earliest-expiring lot first (FIFO), writes an audit-log movement per
 * decrement, and marks the case completed. `inventory` is the caller's
 * current in-memory snapshot, used only to pick which rows to decrement —
 * the actual writes go straight to Supabase.
 */
export async function logCaseUsage(params: {
  caseRow: CaseRow;
  usedItems: UsedItem[];
  inventory: InventoryItem[];
  movedBy: string;
  territoryId: string;
}): Promise<void> {
  const { caseRow, usedItems, inventory, movedBy, territoryId } = params;
  const facilityId = caseRow.facility_id;
  if (!facilityId) throw new Error("Case has no facility set");

  for (const use of usedItems) {
    if (use.quantity <= 0) continue;

    const rows = inventory
      .filter(
        (i) => i.category === use.category && i.name === use.name && i.location_id === facilityId,
      )
      .sort((a, b) => (a.expiration_date ?? "9999-12-31").localeCompare(b.expiration_date ?? "9999-12-31"));

    let remaining = use.quantity;
    for (const row of rows) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, row.quantity);
      if (consumed <= 0) continue;
      remaining -= consumed;

      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ quantity: row.quantity - consumed })
        .eq("id", row.id);
      if (updateError) throw updateError;

      const { error: moveError } = await supabase.from("movements").insert({
        territory_id: territoryId,
        item_id: row.id,
        from_location: facilityId,
        to_location: facilityId,
        moved_by: movedBy,
        related_case_id: caseRow.id,
        note: `Used ${consumed} in case`,
      });
      if (moveError) throw moveError;
    }
  }

  const { error: caseError } = await supabase
    .from("cases")
    .update({ status: "completed" })
    .eq("id", caseRow.id);
  if (caseError) throw caseError;
}

/**
 * Starts the 48-hour return clock on a loaner kit that was used in a case:
 * sets the deadline to two days after the surgery date, assigns it to the
 * case, and logs an audit movement. Clears any prior extension, since the
 * clock has restarted for this use.
 */
export async function markLoanerUsed(params: {
  item: InventoryItem;
  caseRow: CaseRow;
  movedBy: string;
  territoryId: string;
}): Promise<void> {
  const { item, caseRow, movedBy, territoryId } = params;
  const deadline = new Date(`${caseRow.surgery_date}T00:00:00`);
  deadline.setDate(deadline.getDate() + 2);
  const deadlineISO = deadline.toISOString().slice(0, 10);

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({
      assigned_case_id: caseRow.id,
      loaner_return_deadline: deadlineISO,
      return_extended_until: null,
      return_extension_reason: null,
    })
    .eq("id", item.id);
  if (updateError) throw updateError;

  const { error: moveError } = await supabase.from("movements").insert({
    territory_id: territoryId,
    item_id: item.id,
    from_location: item.location_id,
    to_location: item.location_id,
    moved_by: movedBy,
    related_case_id: caseRow.id,
    note: `Used in case, return due ${deadlineISO}`,
  });
  if (moveError) throw moveError;
}

/** Records an approved extension: keep this loaner past its default deadline. */
export async function extendLoanerReturn(params: {
  itemId: string;
  until: string;
  reason: string;
  movedBy: string;
  territoryId: string;
  relatedCaseId?: string | null;
}): Promise<void> {
  const { itemId, until, reason, movedBy, territoryId, relatedCaseId } = params;

  const { data: item, error: fetchError } = await supabase
    .from("inventory_items")
    .select("location_id")
    .eq("id", itemId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({ return_extended_until: until, return_extension_reason: reason })
    .eq("id", itemId);
  if (updateError) throw updateError;

  const { error: moveError } = await supabase.from("movements").insert({
    territory_id: territoryId,
    item_id: itemId,
    from_location: item.location_id,
    to_location: item.location_id,
    moved_by: movedBy,
    related_case_id: relatedCaseId ?? null,
    note: `Extended return to ${until}: ${reason}`,
  });
  if (moveError) throw moveError;
}

export async function acknowledgeMovement(movementId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from("movements")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: profileId })
    .eq("id", movementId);
  if (error) throw error;
}

export async function listCatalogItems(): Promise<CatalogItem[]> {
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .order("category")
    .order("product_line")
    .order("size_label");
  if (error) throw error;
  return data as CatalogItem[];
}

export async function listSurgeons(): Promise<Surgeon[]> {
  const { data, error } = await supabase.from("surgeons").select("*").order("name");
  if (error) throw error;
  return data as Surgeon[];
}

export async function createSurgeon(name: string, territoryId: string): Promise<Surgeon> {
  const { data, error } = await supabase
    .from("surgeons")
    .insert({ name, territory_id: territoryId })
    .select()
    .single();
  if (error) throw error;
  return data as Surgeon;
}

export async function updateSurgeonNotes(surgeonId: string, notes: string): Promise<void> {
  const { error } = await supabase.from("surgeons").update({ notes }).eq("id", surgeonId);
  if (error) throw error;
}

export async function listSurgeonPreferences(): Promise<SurgeonPreference[]> {
  const { data, error } = await supabase.from("surgeon_preferences").select("*");
  if (error) throw error;
  return data as SurgeonPreference[];
}

export async function listToteTemplatesWithItems(): Promise<ToteTemplateWithItems[]> {
  const { data, error } = await supabase
    .from("tote_templates")
    .select("*, tote_template_items(*, catalog_item:catalog_items(*))");
  if (error) throw error;
  return data as ToteTemplateWithItems[];
}
