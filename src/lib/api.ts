import { supabase } from "./supabase";
import { downscaleImage } from "./images";
import type {
  Integration,
  IntegrationLink,
  IntegrationRun,
  IntegrationRunKind,
  IntegrationRunStatus,
  IntegrationRunTrigger,
  IntegrationWithRun,
  DailyReport,
  DailyReportFull,
  DailyReportItem,
  DailyReportPhoto,
  AssetMovement,
  AssetPhoto,
  AssetPhotoKind,
  AssetStatus,
  BillingStatus,
  BoardComment,
  BoardPost,
  BoardPostKind,
  CalendarBlock,
  CaseAssignee,
  CaseAssigneeRole,
  CaseChecklistMark,
  DayChecklistMark,
  DayRequirement,
  EntityEvent,
  EntityLink,
  GraphEntityType,
  CaseItemPlan,
  CaseRow,
  CaseTemplateWithItems,
  CatalogItem,
  AcquisitionType,
  CatalogJoint,
  CatalogSide,
  CementType,
  EntityNote,
  Facility,
  FacilityCredential,
  InventoryItem,
  InventoryReceipt,
  ItemCategory,
  Movement,
  NoteEntityType,
  NoteLinkRelationship,
  PageEntityType,
  PageLink,
  PersonalTask,
  Profile,
  QaAnswer,
  QaQuestion,
  RepCertification,
  SecondBrainStatus,
  Surgeon,
  SurgeonPreference,
  TaskPhoto,
  NotePhoto,
  PagePhoto,
  TaskStage,
  TaskStatus,
  TerritoryNote,
  TerritoryNoteEntityType,
  TerritoryNoteFeedItem,
  TerritoryNoteLink,
  TerritoryNoteTag,
  TerritoryNoteType,
  TimeOff,
  ToteTemplate,
  ToteTemplateItem,
  ToteTemplateWithItems,
  TrackedAsset,
  WikiPage,
} from "./types";
import { extractLinkTitles, slugify } from "./wikilinks";

export async function listFacilities(): Promise<Facility[]> {
  const { data, error } = await supabase
    .from("facilities")
    .select("*")
    .order("sourcing_priority")
    .order("name");
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
  status?: "scheduled" | "completed";
  purchase_order_no?: string | null;
  invoice_no?: string | null;
  billing_status?: BillingStatus;
  territory_id: string;
  created_by: string;
}

export async function createCase(input: NewCaseInput): Promise<CaseRow> {
  const { data, error } = await supabase.from("cases").insert(input).select().single();
  if (error) throw error;
  const row = data as CaseRow;
  logEvent({
    entity_type: "case",
    entity_id: row.id,
    verb: "created",
    actor_id: input.created_by,
    payload: { surgery_type: row.surgery_type, surgery_date: row.surgery_date, facility_id: row.facility_id },
    territory_id: input.territory_id,
  }).catch(() => {});
  return row;
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

/**
 * Look up a scanned item.
 *
 * Deliberately not maybeSingle(). barcode_value holds a GTIN, and a GTIN
 * identifies a *product*, not a unit -- two boxes of the same implant in
 * different lots are two rows carrying the same barcode_value, which is normal
 * and expected. maybeSingle() treats that as an error (PGRST116) and threw, so
 * scanning the one product you happen to hold two of failed while scanning
 * everything else worked. Newest first, because a rep scanning a box is far
 * more often handling the one that arrived most recently.
 */
export async function findItemByBarcode(barcode: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("barcode_value", barcode)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as InventoryItem | undefined) ?? null;
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
  photo_url?: string | null;
  acquisition_type?: "consignment" | "loaner";
  loaner_tote_id?: string | null;
  loaner_code?: string | null;
  contents_label?: string | null;
  cement_type?: "cemented" | "cementless" | null;
}

export async function createInventoryItem(
  input: NewItemInput,
  actorId?: string,
): Promise<InventoryItem> {
  const { data, error } = await supabase.from("inventory_items").insert(input).select().single();
  if (error) throw error;
  const row = data as InventoryItem;
  logEvent({
    entity_type: "inventory_item",
    entity_id: row.id,
    verb: "created",
    actor_id: actorId ?? null,
    payload: { name: row.name, category: row.category },
    territory_id: input.territory_id,
  }).catch(() => {});
  return row;
}

/** Fix a mistyped item (lot, expiration, quantity, name, cement, location). */
export async function updateInventoryItem(
  id: string,
  patch: Partial<
    Pick<
      InventoryItem,
      "name"
      | "lot_number"
      | "expiration_date"
      | "quantity"
      | "location_id"
      | "cement_type"
      | "sterilization_status"
      | "sterilization_expires_at"
      | "delivery_status"
      | "expected_delivery_date"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("inventory_items").update(patch).eq("id", id);
  if (error) throw error;
}

/** Delete an inventory item. If it's a loaner tote, its contents go too. */
export async function deleteInventoryItem(id: string): Promise<void> {
  // Remove any loaner-tote contents that point at this row first.
  await supabase.from("inventory_items").delete().eq("loaner_tote_id", id);
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

/** One line of a loaner tote's contents: a catalog item and how many of it are inside. */
export interface LoanerContentLine {
  /** Null when the item number is not in the catalog -- the name carries the REF. */
  catalog_item_id: string | null;
  name: string;
  category: ItemCategory;
  quantity: number;
  lot_number?: string | null;
  /** Box labels print an expiry; slips do not. Feeds the expiring-lot warnings. */
  expiration_date?: string | null;
  /** REF read off the slip. Needed to teach the catalog an item it has not met. */
  item_number?: string | null;
  /** Rep asked for this REF to be added to the catalog on save. */
  learn?: boolean;
  side?: CatalogSide | null;
  joint?: CatalogJoint;
  size_label?: string | null;
}

/**
 * Creates catalog rows for slip lines carrying a REF the catalog has never
 * seen, and returns them keyed by REF.
 *
 * Without this a new item still reaches inventory, but as an orphan: no side,
 * no joint, no product line, so it cannot sit in a tote template or answer a
 * side-aware readiness line -- and the next slip carrying the same REF arrives
 * just as unmatched. The catalog only ever grew by hand, which is why it has
 * 931 rows and the territory has more products than that.
 *
 * Re-checks the database rather than trusting the caller's snapshot: two slips
 * photographed back to back would otherwise each create the same REF.
 */
export async function learnCatalogItems(
  lines: LoanerContentLine[],
  territoryId: string,
): Promise<Map<string, string>> {
  const wanted = lines.filter((l) => l.learn && !l.catalog_item_id && l.item_number);
  const byRef = new Map<string, string>();
  if (wanted.length === 0) return byRef;

  const refs = [...new Set(wanted.map((l) => l.item_number as string))];
  const { data: existing } = await supabase
    .from("catalog_items")
    .select("id,item_number")
    .in("item_number", refs);
  for (const row of (existing ?? []) as { id: string; item_number: string }[]) {
    byRef.set(row.item_number, row.id);
  }

  const toCreate = refs.filter((r) => !byRef.has(r));
  if (toCreate.length === 0) return byRef;

  const seen = new Set<string>();
  const rows = wanted
    .filter((l) => {
      const ref = l.item_number as string;
      if (byRef.has(ref) || seen.has(ref)) return false;
      seen.add(ref);
      return true;
    })
    .map((l) => ({
      territory_id: territoryId,
      item_number: l.item_number as string,
      name: l.name,
      category: l.category,
      side: l.side ?? "NA",
      joint: l.joint ?? "NA",
      size_label: l.size_label ?? null,
      // Left blank rather than guessed. A wrong product line is invisible in
      // the editor; a blank one reads as "someone should fill this in".
      product_line: null,
      cement_type: null,
      device_type: null,
      gtin: null,
    }));

  const { data: created, error } = await supabase
    .from("catalog_items")
    .insert(rows)
    .select("id,item_number");
  if (error) throw error;
  for (const row of (created ?? []) as { id: string; item_number: string }[]) {
    byRef.set(row.item_number, row.id);
  }
  return byRef;
}

/**
 * Creates a loaner tote (the container row, carrying the outer code + inner
 * label) and its contents in one go. Each content line becomes its own
 * inventory row linked to a catalog item and back to the tote, with
 * acquisition_type 'loaner', so it rolls into per-size/side availability
 * totals right alongside consignment stock.
 */
export async function createLoanerTote(params: {
  loanerCode: string;
  contentsLabel: string | null;
  locationId: string;
  territoryId: string;
  returnDeadline?: string | null;
  photoUrl?: string | null;
  contents: LoanerContentLine[];
}): Promise<InventoryItem> {
  const { loanerCode, contentsLabel, locationId, territoryId, returnDeadline, contents } = params;

  const { data: tote, error: toteError } = await supabase
    .from("inventory_items")
    .insert({
      name: contentsLabel || loanerCode,
      category: "loaner_kit",
      location_id: locationId,
      territory_id: territoryId,
      acquisition_type: "loaner",
      loaner_code: loanerCode,
      contents_label: contentsLabel,
      loaner_return_deadline: returnDeadline ?? null,
      photo_url: params.photoUrl ?? null,
      quantity: 1,
    })
    .select()
    .single();
  if (toteError) throw toteError;
  const toteRow = tote as InventoryItem;

  const rows = contents
    .filter((c) => c.quantity > 0)
    .map((c) => ({
      name: c.name,
      category: c.category,
      catalog_item_id: c.catalog_item_id,
      lot_number: c.lot_number ?? null,
      expiration_date: c.expiration_date ?? null,
      location_id: locationId,
      territory_id: territoryId,
      acquisition_type: "loaner" as const,
      loaner_tote_id: toteRow.id,
      quantity: c.quantity,
    }));

  if (rows.length > 0) {
    const { error: contentError } = await supabase.from("inventory_items").insert(rows);
    if (contentError) throw contentError;
  }

  return toteRow;
}

/**
 * Receives a whole tote: one stock row for the tote itself, plus a row for
 * every item its template says is inside, in one action.
 *
 * This is the bulk path the ledger has been missing. `createInventoryItem`
 * inserts one row at a time, so putting a KA One Complete Tote on the shelf
 * meant 74 separate entries and nobody was ever going to do that -- which is
 * why 931 catalog rows sat against 7 inventory rows.
 *
 * `toteName` is separate from the template name and it is the important
 * argument. Readiness matches a checklist line to stock by **exact name**, and
 * the checklist asks for "Complete Tote (Right)" while the template is called
 * "KA One Complete Tote". Passing the name the checklist uses is what makes a
 * received tote turn a case green off real stock instead of a manual tick.
 */
export async function receiveTote(params: {
  template: ToteTemplateWithItems;
  /** What the tote row is called. Should match the checklist line it satisfies. */
  toteName: string;
  locationId: string;
  territoryId: string;
  acquisitionType: AcquisitionType;
  loanerCode?: string | null;
  returnDeadline?: string | null;
  movedBy?: string | null;
  photoUrl?: string | null;
  /** Template-item id -> quantity. Absent entries use quantity_per_tote; 0 skips. */
  quantities?: Record<string, number>;
}): Promise<{ tote: InventoryItem; contents: number }> {
  const { template, toteName, locationId, territoryId, acquisitionType } = params;

  const { data: tote, error: toteError } = await supabase
    .from("inventory_items")
    .insert({
      name: toteName,
      category: "loaner_kit",
      location_id: locationId,
      territory_id: territoryId,
      acquisition_type: acquisitionType,
      loaner_code: params.loanerCode ?? null,
      contents_label: template.name,
      // Only a loaner has somewhere to go back to. A consignment tote with a
      // return deadline would start a countdown that never legitimately ends.
      loaner_return_deadline: acquisitionType === "loaner" ? (params.returnDeadline ?? null) : null,
      photo_url: params.photoUrl ?? null,
      quantity: 1,
    })
    .select()
    .single();
  if (toteError) throw toteError;
  const toteRow = tote as InventoryItem;

  const rows = template.tote_template_items
    .map((tti) => ({
      tti,
      quantity: params.quantities?.[tti.id] ?? tti.quantity_per_tote,
    }))
    .filter((r) => r.quantity > 0 && r.tti.catalog_item)
    .map((r) => ({
      name: r.tti.catalog_item.name,
      category: r.tti.catalog_item.category,
      catalog_item_id: r.tti.catalog_item_id,
      location_id: locationId,
      territory_id: territoryId,
      acquisition_type: acquisitionType,
      // The link back to the tote, so returning or moving it can find its
      // contents. Set for consignment too -- the tote is still the container
      // even when nothing is going back to Medacta.
      loaner_tote_id: toteRow.id,
      quantity: r.quantity,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("inventory_items").insert(rows);
    if (error) throw error;
  }

  // One movement for the tote, not one per content row. Receiving a 74-line
  // tote is a single thing that happened, and 75 rows in the activity feed
  // would bury every other event of the day.
  const { error: moveError } = await supabase.from("movements").insert({
    territory_id: territoryId,
    item_id: toteRow.id,
    from_location: null,
    to_location: locationId,
    moved_by: params.movedBy ?? null,
    note: `Received ${template.name} — ${rows.length} line${rows.length === 1 ? "" : "s"}`,
  });
  if (moveError) throw moveError;

  return { tote: toteRow, contents: rows.length };
}

/** The individual content rows of a loaner tote. */
export async function listLoanerContents(toteId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("loaner_tote_id", toteId)
    .order("name");
  if (error) throw error;
  return data as InventoryItem[];
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

  logEvent({
    entity_type: "inventory_item",
    entity_id: item.id,
    verb: "moved",
    actor_id: movedBy,
    payload: { from: item.location_id, to: toLocation, relatedCaseId: relatedCaseId ?? null },
    territory_id: territoryId,
  }).catch(() => {});
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

  logEvent({
    entity_type: "case",
    entity_id: caseRow.id,
    verb: "completed",
    actor_id: movedBy,
    payload: { itemsUsed: usedItems.length },
    territory_id: territoryId,
  }).catch(() => {});
}

/**
 * Starts the 48-hour return clock on a loaner kit that was used in a case:
 * sets the deadline to two days after the surgery date, assigns it to the
 * case, and logs an audit movement. Clears any prior extension, since the
 * clock has restarted for this use.
 */
// ---- Tracked assets (KAONE sets, revision totes) --------------------------

export async function listTrackedAssets(): Promise<TrackedAsset[]> {
  const { data, error } = await supabase
    .from("tracked_assets")
    .select("*")
    .order("kind", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw error;
  return data as TrackedAsset[];
}

export async function listAssetMovements(assetId: string): Promise<AssetMovement[]> {
  const { data, error } = await supabase
    .from("asset_movements")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as AssetMovement[];
}

/**
 * Move / re-status a tracked asset and log the change to its history in one go.
 * Passing is_placeholder=false stamps the asset as human-confirmed the first
 * time a real location is set, so the UI stops flagging it as a seeded shell.
 */
export async function moveAsset(params: {
  asset: TrackedAsset;
  toLocation: string | null;
  status: AssetStatus;
  availableDate?: string | null;
  relatedCaseId?: string | null;
  movedBy: string;
  territoryId: string;
  note?: string | null;
}): Promise<void> {
  const { asset, toLocation, status, availableDate, relatedCaseId, movedBy, territoryId, note } =
    params;

  const { error: updateError } = await supabase
    .from("tracked_assets")
    .update({
      location_id: toLocation,
      status,
      available_date: availableDate ?? asset.available_date,
      assigned_case_id: relatedCaseId ?? asset.assigned_case_id,
      is_placeholder: false,
    })
    .eq("id", asset.id);
  if (updateError) throw updateError;

  const { error: moveError } = await supabase.from("asset_movements").insert({
    territory_id: territoryId,
    asset_id: asset.id,
    from_location: asset.location_id,
    to_location: toLocation,
    status_after: status,
    moved_by: movedBy,
    related_case_id: relatedCaseId ?? null,
    note: note ?? null,
  });
  if (moveError) throw moveError;
}

/** Rename an asset's code/label — real set IDs are learned over time. */
export async function updateTrackedAsset(
  id: string,
  patch: Partial<Pick<TrackedAsset, "code" | "label" | "notes">>,
): Promise<void> {
  const { error } = await supabase.from("tracked_assets").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setNotePinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from("entity_notes").update({ pinned }).eq("id", id);
  if (error) throw error;
}

export async function completeCase(caseId: string): Promise<void> {
  const { error } = await supabase.from("cases").update({ status: "completed" }).eq("id", caseId);
  if (error) throw error;
}

/**
 * Deduct the confirmed sticker-sheet allocations from inventory, one audit
 * movement per row touched. Caller has already shown the review screen —
 * only rep-confirmed lines reach here. Rows may hit zero but are kept, same
 * as logCaseUsage, so the "we're out of this" signal is visible.
 */
export async function consumeStickerUsage(params: {
  allocations: { item: InventoryItem; quantity: number }[];
  caseId: string | null;
  movedBy: string;
  territoryId: string;
  /** What to call the source in the movement note — defaults to "sticker sheet". */
  source?: string;
}): Promise<void> {
  const { allocations, caseId, movedBy, territoryId, source = "sticker sheet" } = params;
  for (const a of allocations) {
    if (a.quantity <= 0) continue;
    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({ quantity: Math.max(0, a.item.quantity - a.quantity) })
      .eq("id", a.item.id);
    if (updateError) throw updateError;

    const { error: moveError } = await supabase.from("movements").insert({
      territory_id: territoryId,
      item_id: a.item.id,
      from_location: a.item.location_id,
      to_location: a.item.location_id,
      moved_by: movedBy,
      related_case_id: caseId,
      note: `Used ${a.quantity} in case (${source})`,
    });
    if (moveError) throw moveError;
  }

  if (caseId) {
    logEvent({
      entity_type: "case",
      entity_id: caseId,
      verb: "items_consumed",
      actor_id: movedBy,
      payload: { source, lineCount: allocations.length },
      territory_id: territoryId,
    }).catch(() => {});
  }
}

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

export interface NewCatalogItemInput {
  name: string;
  category: ItemCategory;
  joint: CatalogJoint;
  device_type?: string | null;
  product_line?: string | null;
  side?: CatalogSide | null;
  size_label?: string | null;
  cement_type?: CementType | null;
  territory_id: string;
}

/** Creates a brand-new catalog entry on the fly, e.g. scanning in a device that has no existing catalog match. */
export async function createCatalogItem(input: NewCatalogItemInput): Promise<CatalogItem> {
  const { data, error } = await supabase.from("catalog_items").insert(input).select().single();
  if (error) throw error;
  return data as CatalogItem;
}

/** Remembers a scanned GTIN against a catalog item so future barcode scans of the same product auto-match without asking again. */
export async function linkCatalogItemGtin(catalogItemId: string, gtin: string): Promise<void> {
  const { error } = await supabase.from("catalog_items").update({ gtin }).eq("id", catalogItemId);
  if (error) throw error;
}

/**
 * Uploads a reference photo to the public `item-photos` bucket and returns its
 * public URL.
 *
 * Every photo in the app goes through here -- item shots, loaner kits, restock
 * intake and task stage photos -- so the downscale is applied once, at the one
 * point they all pass.
 */
export async function uploadItemPhoto(file: File, territoryId: string): Promise<string> {
  const shrunk = await downscaleImage(file);
  const ext = shrunk.name.split(".").pop() ?? "jpg";
  const path = `${territoryId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("item-photos").upload(path, shrunk);
  if (error) throw error;
  const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
  return data.publicUrl;
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

export async function updateSurgeonName(surgeonId: string, name: string): Promise<void> {
  const { error } = await supabase.from("surgeons").update({ name }).eq("id", surgeonId);
  if (error) throw error;
}

export async function updateToteTemplateName(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("tote_templates").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function updateCatalogItemName(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("catalog_items").update({ name }).eq("id", id);
  if (error) throw error;
}

// ---- Sets (tote templates) -------------------------------------------------
// A Set is the myOPS packing list for one tray or tote. They arrive from
// imported packing lists, but a territory's real trays drift from the
// catalogue -- a tote gets split, an extra travelling tray appears, a revision
// set is built locally -- so every part of a Set has to be editable by hand.

export interface ToteTemplatePatch {
  name?: string;
  code?: string | null;
  content_type?: string | null;
  reusable?: boolean;
  advisory_cases_per_unit?: number | null;
  notes?: string | null;
}

export async function createToteTemplate(
  input: ToteTemplatePatch & { name: string; territory_id: string },
): Promise<ToteTemplate> {
  const { data, error } = await supabase.from("tote_templates").insert(input).select().single();
  if (error) throw error;
  return data as ToteTemplate;
}

export async function updateToteTemplate(id: string, patch: ToteTemplatePatch): Promise<void> {
  const { error } = await supabase.from("tote_templates").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * `tote_template_items` cascades, so the contents go with it. Surgeon
 * preferences point at totes *without* a cascade, so a Set that a surgeon's
 * preference still references will refuse to delete -- surfaced as plain
 * English rather than a Postgres foreign-key code.
 */
export async function deleteToteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("tote_templates").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "A surgeon's preferences still use this set. Point that preference at a different set first.",
      );
    }
    throw error;
  }
}

export async function addToteTemplateItem(input: {
  tote_template_id: string;
  catalog_item_id: string;
  quantity_per_tote?: number;
  pack_layer?: number | null;
}): Promise<ToteTemplateItem> {
  const { data, error } = await supabase
    .from("tote_template_items")
    .insert({ quantity_per_tote: 1, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as ToteTemplateItem;
}

export async function updateToteTemplateItem(
  id: string,
  patch: { quantity_per_tote?: number; pack_layer?: number | null },
): Promise<void> {
  const { error } = await supabase.from("tote_template_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteToteTemplateItem(id: string): Promise<void> {
  const { error } = await supabase.from("tote_template_items").delete().eq("id", id);
  if (error) throw error;
}

// ---- Catalog editing -------------------------------------------------------

export type CatalogItemPatch = Partial<
  Pick<
    CatalogItem,
    | "name"
    | "item_number"
    | "gtin"
    | "category"
    | "joint"
    | "device_type"
    | "product_line"
    | "side"
    | "size_label"
    | "cement_type"
    | "equivalent_loaner_code"
  >
>;

export async function updateCatalogItem(id: string, patch: CatalogItemPatch): Promise<void> {
  const { error } = await supabase.from("catalog_items").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Catalog rows are referenced by on-hand stock and by Set contents, neither of
 * which cascades -- deliberately, because silently deleting a rep's inventory
 * to tidy the catalog would be far worse than refusing. The caller gets told
 * what is holding it.
 */
export async function deleteCatalogItem(id: string): Promise<void> {
  const [{ count: stockCount }, { count: setCount }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("catalog_item_id", id),
    supabase
      .from("tote_template_items")
      .select("id", { count: "exact", head: true })
      .eq("catalog_item_id", id),
  ]);

  const blockers: string[] = [];
  if (stockCount) blockers.push(`${stockCount} on-hand item${stockCount === 1 ? "" : "s"}`);
  if (setCount) blockers.push(`${setCount} set line${setCount === 1 ? "" : "s"}`);
  if (blockers.length) {
    throw new Error(`Still used by ${blockers.join(" and ")}. Remove those first.`);
  }

  const { error } = await supabase.from("catalog_items").delete().eq("id", id);
  if (error) throw error;
}

// ---- Movement corrections --------------------------------------------------
// A movement is a log entry, so editing one is rewriting history -- but the
// history is only useful if it is true, and a mis-scan or a wrong location
// otherwise sits in the feed forever. Requires migration 047, which adds the
// update/delete policies; before that, both of these fail with a clear error.

export async function updateMovementNote(id: string, note: string | null): Promise<void> {
  const { error } = await supabase.from("movements").update({ note }).eq("id", id);
  if (error) throw movementWriteError(error);
}

/** Deletes a logged move. Does not put the item back where it was -- move it. */
export async function deleteMovement(id: string): Promise<void> {
  const { error } = await supabase.from("movements").delete().eq("id", id);
  if (error) throw movementWriteError(error);
}

function movementWriteError(error: { code?: string; message: string }): Error {
  // RLS refusals surface as an empty result or a policy violation rather than
  // anything a rep could interpret.
  if (error.code === "42501" || /policy/i.test(error.message)) {
    return new Error("Editing movements needs migration 047. Run it, then try again.");
  }
  return new Error(error.message);
}

// ---- Case editing ----------------------------------------------------------

export type CasePatch = Partial<
  Pick<
    CaseRow,
    | "surgery_date"
    | "surgery_time"
    | "facility_id"
    | "surgeon_id"
    | "surgeon"
    | "surgery_type"
    | "variant"
    | "notes"
    | "status"
    | "time_tba"
    | "side"
  >
>;

export async function updateCase(
  id: string,
  patch: CasePatch,
  actor?: { id: string; territoryId: string },
): Promise<void> {
  const { error } = await supabase.from("cases").update(patch).eq("id", id);
  if (error) throw error;
  if (patch.status && actor) {
    logEvent({
      entity_type: "case",
      entity_id: id,
      verb: "status_changed",
      actor_id: actor.id,
      payload: { status: patch.status },
      territory_id: actor.territoryId,
    }).catch(() => {});
  }
}

export async function deleteCase(id: string): Promise<void> {
  const { error } = await supabase.from("cases").delete().eq("id", id);
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

// ---- CRM: certifications, plans, Q&A, credentials, billing ----------------

export async function listRepCertifications(): Promise<RepCertification[]> {
  const { data, error } = await supabase.from("rep_certifications").select("*").order("expires_on");
  if (error) throw error;
  return data as RepCertification[];
}

export async function createRepCertification(input: {
  profile_id: string;
  name: string;
  expires_on: string | null;
  territory_id: string;
}): Promise<void> {
  const { error } = await supabase.from("rep_certifications").insert(input);
  if (error) throw error;
}

export async function createCaseItemPlans(
  rows: Omit<CaseItemPlan, "id" | "created_at">[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("case_item_plans").insert(rows);
  if (error) throw error;
}

export async function listCaseItemPlans(caseId: string): Promise<CaseItemPlan[]> {
  const { data, error } = await supabase
    .from("case_item_plans")
    .select("*")
    .eq("case_id", caseId)
    .order("category");
  if (error) throw error;
  return data as CaseItemPlan[];
}

// ---- Manual checklist check-off -------------------------------------------
//
// For the case where the tote is demonstrably sitting there but the catalog
// has never heard of it. Marks clear a checklist line and nothing else -- no
// stock is created, nothing is deducted, the pack list never sees them.

export async function listCaseChecklistMarks(caseId: string): Promise<CaseChecklistMark[]> {
  const { data, error } = await supabase
    .from("case_checklist_marks")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw error;
  return data as CaseChecklistMark[];
}

export async function markChecklistItem(input: {
  case_id: string;
  item_key: string;
  note?: string | null;
  territory_id: string;
  marked_by: string;
}): Promise<CaseChecklistMark> {
  const { data, error } = await supabase
    .from("case_checklist_marks")
    .insert({
      case_id: input.case_id,
      item_key: input.item_key,
      note: input.note ?? null,
      territory_id: input.territory_id,
      marked_by: input.marked_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CaseChecklistMark;
}

export async function unmarkChecklistItem(caseId: string, itemKey: string): Promise<void> {
  const { error } = await supabase
    .from("case_checklist_marks")
    .delete()
    .eq("case_id", caseId)
    .eq("item_key", itemKey);
  if (error) throw error;
}

// ---- Day-level requirements ------------------------------------------------
//
// The short list that goes in the car on any surgery day, independent of how
// many cases are on it. Read-only here; editing is a Sets-page job.

export async function listDayRequirements(): Promise<DayRequirement[]> {
  const { data, error } = await supabase
    .from("day_requirements")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data as DayRequirement[];
}

export async function listDayChecklistMarks(onDate: string): Promise<DayChecklistMark[]> {
  const { data, error } = await supabase
    .from("day_checklist_marks")
    .select("*")
    .eq("on_date", onDate);
  if (error) throw error;
  return data as DayChecklistMark[];
}

export async function markDayItem(input: {
  on_date: string;
  item_key: string;
  note?: string | null;
  territory_id: string;
  marked_by: string;
}): Promise<DayChecklistMark> {
  const { data, error } = await supabase
    .from("day_checklist_marks")
    .insert({
      on_date: input.on_date,
      item_key: input.item_key,
      note: input.note ?? null,
      territory_id: input.territory_id,
      marked_by: input.marked_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DayChecklistMark;
}

export async function unmarkDayItem(onDate: string, itemKey: string): Promise<void> {
  const { error } = await supabase
    .from("day_checklist_marks")
    .delete()
    .eq("on_date", onDate)
    .eq("item_key", itemKey);
  if (error) throw error;
}

export async function listQaQuestions(): Promise<QaQuestion[]> {
  const { data, error } = await supabase
    .from("qa_questions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as QaQuestion[];
}

export async function listQaAnswers(): Promise<QaAnswer[]> {
  const { data, error } = await supabase.from("qa_answers").select("*").order("created_at");
  if (error) throw error;
  return data as QaAnswer[];
}

export async function createQaQuestion(input: {
  body: string;
  pinned_product: string | null;
  pinned_surgeon_id: string | null;
  pinned_surgery_type: "KNEE" | "HIP" | null;
  territory_id: string;
  author_id: string;
}): Promise<void> {
  const { error } = await supabase.from("qa_questions").insert(input);
  if (error) throw error;
}

export async function createQaAnswer(input: {
  question_id: string;
  body: string;
  territory_id: string;
  author_id: string;
}): Promise<void> {
  const { error } = await supabase.from("qa_answers").insert(input);
  if (error) throw error;
}

export async function acceptQaAnswer(answerId: string): Promise<void> {
  const { error } = await supabase.from("qa_answers").update({ accepted: true }).eq("id", answerId);
  if (error) throw error;
}

export async function listFacilityCredentials(): Promise<FacilityCredential[]> {
  const { data, error } = await supabase
    .from("facility_credentials")
    .select("*")
    .order("expires_on");
  if (error) throw error;
  return data as FacilityCredential[];
}

export async function createFacilityCredential(input: {
  profile_id: string;
  facility_id: string;
  vendor: string;
  expires_on: string;
  territory_id: string;
}): Promise<void> {
  const { error } = await supabase.from("facility_credentials").insert(input);
  if (error) throw error;
  logEvent({
    entity_type: "facility",
    entity_id: input.facility_id,
    verb: "credential_added",
    actor_id: input.profile_id,
    payload: { vendor: input.vendor, expires_on: input.expires_on },
    territory_id: input.territory_id,
  }).catch(() => {});
}

export async function updateCaseBilling(
  caseId: string,
  patch: { billing_status?: BillingStatus; purchase_order_no?: string | null; invoice_no?: string | null },
): Promise<void> {
  const stamped = patch.billing_status
    ? { ...patch, billing_updated_at: new Date().toISOString() }
    : patch;
  const { error } = await supabase.from("cases").update(stamped).eq("id", caseId);
  if (error) throw error;
}

// ---- Time off ---------------------------------------------------------------

export async function listTimeOff(): Promise<TimeOff[]> {
  const { data, error } = await supabase
    .from("rep_time_off")
    .select("*")
    .order("start_date", { ascending: true });
  if (error) throw error;
  return data as TimeOff[];
}

export async function createTimeOff(input: {
  territory_id: string;
  rep_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
}): Promise<TimeOff> {
  const { data, error } = await supabase.from("rep_time_off").insert(input).select().single();
  if (error) throw error;
  return data as TimeOff;
}

export async function deleteTimeOff(id: string): Promise<void> {
  const { error } = await supabase.from("rep_time_off").delete().eq("id", id);
  if (error) throw error;
}

// ---- Team board -----------------------------------------------------------

export async function listBoardPosts(): Promise<BoardPost[]> {
  const { data, error } = await supabase
    .from("board_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as BoardPost[];
}

export async function createBoardPost(input: {
  body: string;
  kind: BoardPostKind;
  category?: string;
  assignee_id?: string | null;
  mentioned_ids?: string[];
  territory_id: string;
  author_id: string;
}): Promise<BoardPost> {
  const { data, error } = await supabase
    .from("board_posts")
    .insert({
      body: input.body,
      kind: input.kind,
      category: input.category ?? "general",
      assignee_id: input.assignee_id ?? null,
      mentioned_ids: input.mentioned_ids ?? [],
      territory_id: input.territory_id,
      author_id: input.author_id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BoardPost;
}

/** Check/uncheck a to-do, stamping who closed it and when. */
export async function setTodoDone(
  postId: string,
  done: boolean,
  profileId: string,
): Promise<void> {
  const { error } = await supabase
    .from("board_posts")
    .update({
      done,
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? profileId : null,
    })
    .eq("id", postId);
  if (error) throw error;
}

export async function setPostPinned(postId: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from("board_posts").update({ pinned }).eq("id", postId);
  if (error) throw error;
}

export async function setPostAcks(postId: string, ackedBy: string[]): Promise<void> {
  const { error } = await supabase.from("board_posts").update({ acked_by: ackedBy }).eq("id", postId);
  if (error) throw error;
}

export async function deleteBoardPost(postId: string): Promise<void> {
  const { error } = await supabase.from("board_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function listBoardComments(): Promise<BoardComment[]> {
  const { data, error } = await supabase
    .from("board_comments")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as BoardComment[];
}

export async function createBoardComment(input: {
  post_id: string;
  body: string;
  territory_id: string;
  author_id: string;
}): Promise<BoardComment> {
  const { data, error } = await supabase
    .from("board_comments")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as BoardComment;
}

// ---- Personal tasks (private by default; RLS enforces visibility) ---------

export async function listMyTasks(): Promise<PersonalTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PersonalTask[];
}

export async function createTask(input: {
  title: string;
  notes?: string | null;
  due_date?: string | null;
  shared_with?: string[];
  status?: TaskStatus;
  assigned_to?: string | null;
  source_note_id?: string | null;
  entity_type?: NoteEntityType | null;
  entity_id?: string | null;
  territory_id: string;
  owner_id: string;
}): Promise<PersonalTask> {
  const { data, error } = await supabase.from("tasks").insert(input).select().single();
  if (error) throw error;
  const row = data as PersonalTask;
  logEvent({
    entity_type: "task",
    entity_id: row.id,
    verb: "created",
    actor_id: input.owner_id,
    payload: { title: row.title },
    territory_id: input.territory_id,
  }).catch(() => {});
  return row;
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<PersonalTask, "title" | "notes" | "due_date" | "status" | "shared_with" | "assigned_to" | "done_at">
  >,
  actor?: { id: string; territoryId: string },
): Promise<void> {
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw error;
  if (patch.status === "done" && actor) {
    logEvent({
      entity_type: "task",
      entity_id: id,
      verb: "completed",
      actor_id: actor.id,
      territory_id: actor.territoryId,
    }).catch(() => {});
  }
}

/** Tasks spawned from a specific territory note (entity_type="note"). */
/** Every task filed against one record, newest first. */
export async function listTasksForEntity(
  entityType: NoteEntityType,
  entityId: string,
): Promise<PersonalTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PersonalTask[];
}

export async function listTasksForNote(noteId: string): Promise<PersonalTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("entity_type", "note")
    .eq("entity_id", noteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PersonalTask[];
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ---- Universal notes ------------------------------------------------------

export async function listEntityNotes(
  entityType: NoteEntityType,
  entityId: string,
): Promise<EntityNote[]> {
  const { data, error } = await supabase
    .from("entity_notes")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as EntityNote[];
}

export async function createEntityNote(input: {
  entity_type: NoteEntityType;
  entity_id: string;
  body: string;
  territory_id: string;
  author_id: string;
}): Promise<void> {
  const { error } = await supabase.from("entity_notes").insert(input);
  if (error) throw error;
}

export async function updateEntityNote(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from("entity_notes")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEntityNote(id: string): Promise<void> {
  const { error } = await supabase.from("entity_notes").delete().eq("id", id);
  if (error) throw error;
}

/** Rename/re-address a location in-app (e.g. once you learn where an RM's stock lives). */
export async function updateFacility(
  id: string,
  patch: Partial<Pick<Facility, "name" | "address">>,
): Promise<void> {
  const { error } = await supabase.from("facilities").update(patch).eq("id", id);
  if (error) throw error;
}

/** Every note across the territory, newest first — powers global notes search. */
export async function listAllEntityNotes(limit = 500): Promise<EntityNote[]> {
  const { data, error } = await supabase
    .from("entity_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as EntityNote[];
}

// ---- Territory notes / second brain ---------------------------------------

/** Pinned-first, newest-updated. This is the /notes feed's data source. */
export async function listNoteFeed(limit = 500): Promise<TerritoryNoteFeedItem[]> {
  const { data, error } = await supabase
    .from("territory_note_feed")
    .select("*")
    .limit(limit);
  if (error) throw error;
  return data as TerritoryNoteFeedItem[];
}

export async function getNote(id: string): Promise<TerritoryNote | null> {
  const { data, error } = await supabase.from("territory_notes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as TerritoryNote | null;
}

export async function createNote(input: {
  title?: string;
  body?: string;
  note_type?: TerritoryNoteType;
  visibility?: "private" | "team" | "territory_admin";
  source?: "manual" | "mobile" | "sticker_photo" | "calendar_import" | "catalog_import" | "ai_generated" | "system";
  occurred_at?: string | null;
  territory_id: string;
  owner_id: string;
  created_by: string;
}): Promise<TerritoryNote> {
  const { data, error } = await supabase.from("territory_notes").insert(input).select().single();
  if (error) throw error;
  return data as TerritoryNote;
}

export async function updateNote(
  id: string,
  patch: Partial<
    Pick<TerritoryNote, "title" | "body" | "note_type" | "visibility" | "pinned" | "archived" | "second_brain_status">
  >,
): Promise<void> {
  const { error } = await supabase.from("territory_notes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("territory_notes").delete().eq("id", id);
  if (error) throw error;
}

export async function setSecondBrainStatus(id: string, status: SecondBrainStatus): Promise<void> {
  const { error } = await supabase.from("territory_notes").update({ second_brain_status: status }).eq("id", id);
  if (error) throw error;
}

/**
 * Promote a raw capture note into a durable knowledge page. Creates a page
 * from the note's title/body (+ AI summary if present), then marks the note
 * synced and stashes the new page id in second_brain_path so the note links
 * to the knowledge it became.
 */
export async function promoteNoteToPage(
  note: TerritoryNote,
  profileId: string,
): Promise<WikiPage> {
  const body = note.ai_summary ? `${note.ai_summary}\n\n---\n\n${note.body}` : note.body;
  const page = await createPage({
    territory_id: note.territory_id,
    title: note.title,
    body,
    created_by: profileId,
  });
  const { error } = await supabase
    .from("territory_notes")
    .update({ second_brain_status: "synced", second_brain_path: page.id })
    .eq("id", note.id);
  if (error) throw error;
  return page;
}

export async function listSecondBrainQueue(): Promise<TerritoryNote[]> {
  const { data, error } = await supabase
    .from("territory_second_brain_queue")
    .select("*");
  if (error) throw error;
  return data as TerritoryNote[];
}

export async function listNoteLinks(noteId: string): Promise<TerritoryNoteLink[]> {
  const { data, error } = await supabase
    .from("territory_note_links")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as TerritoryNoteLink[];
}

export async function linkNoteToEntity(input: {
  note_id: string;
  entity_type: TerritoryNoteEntityType;
  entity_id: string;
  relationship?: NoteLinkRelationship;
  territory_id: string;
  created_by: string;
}): Promise<void> {
  const { error } = await supabase.from("territory_note_links").insert(input);
  if (error) throw error;
}

/** A link the model proposed, before anyone has agreed to it. */
export interface SuggestedNoteLink {
  entity_type: TerritoryNoteEntityType;
  entity_id: string;
  /** Human-readable name, so the UI never has to resolve the id itself. */
  label: string;
  relationship: NoteLinkRelationship;
  confidence: "high" | "medium" | "low";
  /** The words in the note that justify it, quoted. */
  evidence: string;
}

/**
 * Asks the `link-note` edge function which entities a note is about.
 *
 * Suggestions only -- nothing is written until the rep taps one. The call is
 * server-side because the Anthropic key cannot exist in a client bundle; see
 * supabase/functions/link-note/index.ts for the rest of that reasoning.
 *
 * Returns an empty list rather than throwing when the function is not deployed
 * or the key is unset, so a territory that has not turned this on sees a note
 * screen that behaves exactly as it did before.
 */
export async function suggestNoteLinks(note: string): Promise<SuggestedNoteLink[]> {
  try {
    const { data, error } = await supabase.functions.invoke("link-note", { body: { note } });
    if (error) return [];
    return ((data as { links?: SuggestedNoteLink[] })?.links ?? []).filter(
      (l) => l.entity_id && l.entity_type,
    );
  } catch {
    return [];
  }
}

export async function unlinkNote(linkId: string): Promise<void> {
  const { error } = await supabase.from("territory_note_links").delete().eq("id", linkId);
  if (error) throw error;
}

export async function listNoteTags(territoryId: string): Promise<TerritoryNoteTag[]> {
  const { data, error } = await supabase
    .from("territory_note_tags")
    .select("*")
    .eq("territory_id", territoryId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as TerritoryNoteTag[];
}

export async function createNoteTag(input: {
  name: string;
  color?: string | null;
  territory_id: string;
  created_by: string;
}): Promise<TerritoryNoteTag> {
  const { data, error } = await supabase.from("territory_note_tags").insert(input).select().single();
  if (error) throw error;
  return data as TerritoryNoteTag;
}

export async function renameNoteTag(tagId: string, name: string): Promise<void> {
  const { error } = await supabase.from("territory_note_tags").update({ name }).eq("id", tagId);
  if (error) throw error;
}

/** Assignments cascade off the tag row, so this alone unfiles it from every note. */
export async function deleteNoteTag(tagId: string): Promise<void> {
  const { error } = await supabase.from("territory_note_tags").delete().eq("id", tagId);
  if (error) throw error;
}

export async function assignNoteTag(noteId: string, tagId: string): Promise<void> {
  const { error } = await supabase.from("territory_note_tag_assignments").insert({ note_id: noteId, tag_id: tagId });
  if (error) throw error;
}

export async function unassignNoteTag(noteId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from("territory_note_tag_assignments")
    .delete()
    .eq("note_id", noteId)
    .eq("tag_id", tagId);
  if (error) throw error;
}

/** A note's own tags — getNote doesn't carry them (only the aggregated feed view does). */
export async function listTagsForNote(noteId: string): Promise<TerritoryNoteTag[]> {
  const { data, error } = await supabase
    .from("territory_note_tag_assignments")
    .select("territory_note_tags(*)")
    .eq("note_id", noteId);
  if (error) throw error;
  return (data ?? []).map((r) => (r as unknown as { territory_note_tags: TerritoryNoteTag }).territory_note_tags);
}

// ---- Entity graph: universal tags, links, events ---------------------------
//
// Works on any (entity_type, entity_id), not just notes. Tags reuse the same
// territory_note_tags pool notes already draw from, so a tag created on a
// note and a tag applied to a case are the same tag, filterable together.

export async function listEntityTags(
  entityType: GraphEntityType,
  entityId: string,
): Promise<TerritoryNoteTag[]> {
  const { data, error } = await supabase
    .from("entity_tag_assignments")
    .select("territory_note_tags(*)")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (error) throw error;
  return (data ?? []).map((r) => (r as unknown as { territory_note_tags: TerritoryNoteTag }).territory_note_tags);
}

export async function tagEntity(input: {
  entity_type: GraphEntityType;
  entity_id: string;
  tag_id: string;
  territory_id: string;
  created_by: string;
}): Promise<void> {
  const { error } = await supabase.from("entity_tag_assignments").insert(input);
  if (error) throw error;
}

export async function untagEntity(
  entityType: GraphEntityType,
  entityId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from("entity_tag_assignments")
    .delete()
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("tag_id", tagId);
  if (error) throw error;
}

export async function linkEntities(input: {
  from_type: GraphEntityType;
  from_id: string;
  to_type: GraphEntityType;
  to_id: string;
  relation?: string;
  territory_id: string;
  created_by: string;
}): Promise<EntityLink> {
  const { data, error } = await supabase.from("entity_links").insert(input).select().single();
  if (error) throw error;
  return data as EntityLink;
}

/** Every link touching this record, in either direction. */
export async function listEntityLinks(
  entityType: GraphEntityType,
  entityId: string,
): Promise<EntityLink[]> {
  const { data, error } = await supabase
    .from("entity_links")
    .select("*")
    .or(
      `and(from_type.eq.${entityType},from_id.eq.${entityId}),and(to_type.eq.${entityType},to_id.eq.${entityId})`,
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as EntityLink[];
}

export async function unlinkEntities(linkId: string): Promise<void> {
  const { error } = await supabase.from("entity_links").delete().eq("id", linkId);
  if (error) throw error;
}

/**
 * Records one line in the append-only event log. Never throws into the
 * caller's own success path — logging a case as created should not be able
 * to fail the case creation itself, so every call site fires this and moves
 * on rather than awaiting it into a try/catch that could roll anything back.
 */
export async function logEvent(input: {
  entity_type: GraphEntityType;
  entity_id: string;
  verb: string;
  actor_id?: string | null;
  payload?: Record<string, unknown>;
  territory_id: string;
}): Promise<void> {
  const { error } = await supabase.from("entity_events").insert({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    verb: input.verb,
    actor_id: input.actor_id ?? null,
    payload: input.payload ?? {},
    territory_id: input.territory_id,
  });
  if (error) throw error;
}

export async function listEntityEvents(
  entityType: GraphEntityType,
  entityId: string,
  limit = 25,
): Promise<EntityEvent[]> {
  const { data, error } = await supabase
    .from("entity_events")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as EntityEvent[];
}

// ---- Note photos --------------------------------------------------------

export async function listNotePhotos(noteId: string): Promise<NotePhoto[]> {
  const { data, error } = await supabase
    .from("note_photos")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at");
  if (error) throw error;
  return data as NotePhoto[];
}

export async function addNotePhoto(input: {
  file: File;
  territory_id: string;
  note_id: string;
  caption?: string | null;
  uploaded_by?: string | null;
}): Promise<NotePhoto> {
  const url = await uploadItemPhoto(input.file, input.territory_id);
  const { data, error } = await supabase
    .from("note_photos")
    .insert({
      territory_id: input.territory_id,
      note_id: input.note_id,
      url,
      caption: input.caption ?? null,
      uploaded_by: input.uploaded_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as NotePhoto;
}

export async function deleteNotePhoto(id: string): Promise<void> {
  const { error } = await supabase.from("note_photos").delete().eq("id", id);
  if (error) throw error;
}

// ---- Page photos ---------------------------------------------------------

export async function listPagePhotos(pageId: string): Promise<PagePhoto[]> {
  const { data, error } = await supabase
    .from("page_photos")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at");
  if (error) throw error;
  return data as PagePhoto[];
}

export async function addPagePhoto(input: {
  file: File;
  territory_id: string;
  page_id: string;
  caption?: string | null;
  uploaded_by?: string | null;
}): Promise<PagePhoto> {
  const url = await uploadItemPhoto(input.file, input.territory_id);
  const { data, error } = await supabase
    .from("page_photos")
    .insert({
      territory_id: input.territory_id,
      page_id: input.page_id,
      url,
      caption: input.caption ?? null,
      uploaded_by: input.uploaded_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PagePhoto;
}

export async function deletePagePhoto(id: string): Promise<void> {
  const { error } = await supabase.from("page_photos").delete().eq("id", id);
  if (error) throw error;
}

/** Spawn a task from a note (reuses the tasks table, entity_type="note"). */
export async function spawnTaskFromNote(input: {
  note_id: string;
  title: string;
  due_date?: string | null;
  territory_id: string;
  owner_id: string;
}): Promise<PersonalTask> {
  return createTask({
    title: input.title,
    due_date: input.due_date ?? null,
    entity_type: "note",
    entity_id: input.note_id,
    territory_id: input.territory_id,
    owner_id: input.owner_id,
  });
}

// ---- Wiki pages -------------------------------------------------------

export async function listPages(): Promise<WikiPage[]> {
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as WikiPage[];
}

export async function getPage(id: string): Promise<WikiPage | null> {
  const { data, error } = await supabase.from("pages").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as WikiPage | null;
}

export async function getPageByEntity(
  entityType: PageEntityType,
  entityId: string,
): Promise<WikiPage | null> {
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw error;
  return data as WikiPage | null;
}

async function uniqueSlug(territoryId: string, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  for (let n = 2; ; n++) {
    let query = supabase
      .from("pages")
      .select("id")
      .eq("territory_id", territoryId)
      .eq("slug", candidate);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${base}-${n}`;
  }
}

/** Re-derives the full link graph for one page from its current body — always a full replace, never a patch. */
async function relinkPage(territoryId: string, pageId: string, body: string): Promise<void> {
  const { error: delErr } = await supabase.from("page_links").delete().eq("source_page_id", pageId);
  if (delErr) throw delErr;

  const titles = extractLinkTitles(body);
  if (titles.length === 0) return;

  const { data: candidates, error: findErr } = await supabase
    .from("pages")
    .select("id, title")
    .eq("territory_id", territoryId)
    .in(
      "title",
      titles,
    );
  if (findErr) throw findErr;
  const byTitle = new Map((candidates as { id: string; title: string }[]).map((p) => [p.title.toLowerCase(), p.id]));

  const rows = titles.map((title) => ({
    territory_id: territoryId,
    source_page_id: pageId,
    target_page_id: byTitle.get(title.toLowerCase()) ?? null,
    target_title: title,
  }));
  const { error: insErr } = await supabase.from("page_links").insert(rows);
  if (insErr) throw insErr;
}

export async function createPage(input: {
  territory_id: string;
  title: string;
  body?: string;
  tags?: string[];
  entity_type?: PageEntityType | null;
  entity_id?: string | null;
  created_by: string;
}): Promise<WikiPage> {
  const slug = await uniqueSlug(input.territory_id, input.title);
  const { data, error } = await supabase
    .from("pages")
    .insert({
      territory_id: input.territory_id,
      title: input.title,
      slug,
      body: input.body ?? "",
      tags: input.tags ?? [],
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      created_by: input.created_by,
      last_edited_by: input.created_by,
    })
    .select("*")
    .single();
  if (error) throw error;
  const page = data as WikiPage;
  await relinkPage(page.territory_id, page.id, page.body);
  return page;
}

/** Finds a record's canonical page, creating an empty one on first visit. */
export async function ensureCanonicalPage(
  territoryId: string,
  entityType: PageEntityType,
  entityId: string,
  title: string,
  authorId: string,
): Promise<WikiPage> {
  const existing = await getPageByEntity(entityType, entityId);
  if (existing) return existing;
  return createPage({
    territory_id: territoryId,
    title,
    entity_type: entityType,
    entity_id: entityId,
    created_by: authorId,
  });
}

export async function updatePage(
  id: string,
  patch: { title?: string; body?: string; tags?: string[] },
  editorId: string,
): Promise<WikiPage> {
  const current = await getPage(id);
  if (!current) throw new Error("Page not found");

  const updates: Record<string, unknown> = {
    ...patch,
    last_edited_by: editorId,
    updated_at: new Date().toISOString(),
  };
  if (patch.title && patch.title !== current.title) {
    updates.slug = await uniqueSlug(current.territory_id, patch.title, id);
  }

  const { data, error } = await supabase.from("pages").update(updates).eq("id", id).select("*").single();
  if (error) throw error;
  const page = data as WikiPage;
  if (patch.body !== undefined) await relinkPage(page.territory_id, page.id, page.body);
  return page;
}

export async function setPagePinned(id: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.from("pages").update({ pinned }).eq("id", id);
  if (error) throw error;
}

export async function deletePage(id: string): Promise<void> {
  const { error } = await supabase.from("pages").delete().eq("id", id);
  if (error) throw error;
}

/** Pages that link to this page, plus any that reference its title but haven't resolved yet. */
export async function listBacklinks(pageId: string, title: string): Promise<(PageLink & { source: WikiPage })[]> {
  const { data, error } = await supabase
    .from("page_links")
    .select("*, source:source_page_id(*)")
    .or(`target_page_id.eq.${pageId},target_title.ilike.${title}`);
  if (error) throw error;
  return data as unknown as (PageLink & { source: WikiPage })[];
}

/** Case-insensitive title/body search across every page in the territory — powers [[link]] autocomplete and global search. */
export async function searchPages(query: string, limit = 20): Promise<WikiPage[]> {
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as WikiPage[];
}

// -- Calendar blocks (non-case time) ------------------------------------------

export async function listCalendarBlocks(
  startDate: string,
  endDate: string,
): Promise<CalendarBlock[]> {
  const { data, error } = await supabase
    .from("calendar_blocks")
    .select("*")
    .gte("block_date", startDate)
    .lte("block_date", endDate)
    .order("block_date")
    .order("start_time");
  if (error) throw error;
  return data as CalendarBlock[];
}

export async function createCalendarBlock(
  input: Omit<CalendarBlock, "id" | "created_at">,
): Promise<CalendarBlock> {
  const { data, error } = await supabase
    .from("calendar_blocks")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as CalendarBlock;
}

export async function updateCalendarBlock(
  id: string,
  patch: Partial<Pick<CalendarBlock, "label" | "kind" | "start_time" | "end_time" | "facility_id">>,
): Promise<CalendarBlock> {
  const { data, error } = await supabase
    .from("calendar_blocks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CalendarBlock;
}

export async function deleteCalendarBlock(id: string): Promise<void> {
  const { error } = await supabase.from("calendar_blocks").delete().eq("id", id);
  if (error) throw error;
}

// -- Case coverage ------------------------------------------------------------

export async function listCaseAssignees(caseIds: string[]): Promise<CaseAssignee[]> {
  if (caseIds.length === 0) return [];
  const { data, error } = await supabase
    .from("case_assignees")
    .select("*")
    .in("case_id", caseIds);
  if (error) throw error;
  return data as CaseAssignee[];
}

/** Attaches a rep to a case. Re-attaching the same rep just updates their role. */
export async function assignRepToCase(input: {
  territory_id: string;
  case_id: string;
  profile_id: string;
  role?: CaseAssigneeRole;
  note?: string | null;
  created_by?: string | null;
}): Promise<CaseAssignee> {
  const { data, error } = await supabase
    .from("case_assignees")
    .upsert(
      {
        territory_id: input.territory_id,
        case_id: input.case_id,
        profile_id: input.profile_id,
        role: input.role ?? "covering",
        note: input.note ?? null,
        created_by: input.created_by ?? null,
      },
      { onConflict: "case_id,profile_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as CaseAssignee;
}

export async function unassignRepFromCase(id: string): Promise<void> {
  const { error } = await supabase.from("case_assignees").delete().eq("id", id);
  if (error) throw error;
}

// -- Task photos --------------------------------------------------------------

export async function listTaskPhotos(taskIds: string[]): Promise<TaskPhoto[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await supabase
    .from("task_photos")
    .select("*")
    .in("task_id", taskIds)
    .order("created_at");
  if (error) throw error;
  return data as TaskPhoto[];
}

/** Uploads the file to storage, then records it against the task's stage. */
export async function addTaskPhoto(input: {
  file: File;
  territory_id: string;
  task_id: string;
  stage: TaskStage;
  caption?: string | null;
  uploaded_by?: string | null;
}): Promise<TaskPhoto> {
  const url = await uploadItemPhoto(input.file, input.territory_id);
  const { data, error } = await supabase
    .from("task_photos")
    .insert({
      territory_id: input.territory_id,
      task_id: input.task_id,
      stage: input.stage,
      url,
      caption: input.caption ?? null,
      uploaded_by: input.uploaded_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TaskPhoto;
}

export async function deleteTaskPhoto(id: string): Promise<void> {
  const { error } = await supabase.from("task_photos").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Receives a multi-line shipment through the auditable receipt ledger.
 *
 * The receipt stays a draft until every line and attachment has been saved.
 * The final RPC posts it once and creates both inventory and movement history
 * in one database transaction, so a dropped connection cannot leave half a
 * shipment on hand.
 */
export async function receiveInventoryShipment(params: {
  territoryId: string;
  locationId: string;
  packingSlipNumber?: string | null;
  trackingNumber?: string | null;
  vendorName?: string | null;
  notes?: string | null;
  attachment?: File | null;
  lines: LoanerContentLine[];
}): Promise<InventoryReceipt> {
  const learned = await learnCatalogItems(params.lines, params.territoryId);
  const { data: receipt, error: receiptError } = await supabase
    .from("inventory_receipts")
    .insert({
      territory_id: params.territoryId,
      receiving_location_id: params.locationId,
      source_type: "company_shipment",
      vendor_name: params.vendorName?.trim() || null,
      packing_slip_number: params.packingSlipNumber?.trim() || null,
      tracking_number: params.trackingNumber?.trim() || null,
      notes: params.notes?.trim() || null,
    })
    .select()
    .single();
  if (receiptError) throw receiptError;
  const draft = receipt as InventoryReceipt;

  const lines = params.lines
    .filter((line) => line.quantity > 0)
    .map((line, index) => ({
      receipt_id: draft.id,
      territory_id: params.territoryId,
      line_number: index + 1,
      catalog_item_id:
        line.catalog_item_id ??
        (line.item_number ? (learned.get(line.item_number) ?? null) : null),
      item_number: line.item_number ?? null,
      item_name: line.name,
      category: line.category,
      quantity_expected: line.quantity,
      quantity_received: line.quantity,
      lot_number: line.lot_number ?? null,
      expiration_date: line.expiration_date ?? null,
      acquisition_type: "consignment",
    }));

  const { error: linesError } = await supabase.from("inventory_receipt_lines").insert(lines);
  if (linesError) throw linesError;

  if (params.attachment) {
    const original = params.attachment;
    const upload = original.type.startsWith("image/") ? await downscaleImage(original) : original;
    const safeName = original.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const path = `${params.territoryId}/${draft.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("receipt-attachments")
      .upload(path, upload);
    if (uploadError) throw uploadError;

    const { error: attachmentError } = await supabase
      .from("inventory_receipt_attachments")
      .insert({
        receipt_id: draft.id,
        territory_id: params.territoryId,
        kind: "packing_slip",
        storage_path: path,
        original_filename: original.name,
        mime_type: upload.type || original.type || null,
        file_size_bytes: upload.size,
      });
    if (attachmentError) throw attachmentError;
  }

  const { data: posted, error: postError } = await supabase
    .rpc("post_inventory_receipt", { p_receipt_id: draft.id })
    .single();
  if (postError) throw postError;
  return posted as InventoryReceipt;
}

/**
 * The photos of how a tray arrived, ordered the way you repack it: the outside
 * label first so you know you have the right tray, then each layer from the
 * top down.
 */
export async function listAssetPhotos(params: {
  inventoryItemId?: string;
  trackedAssetId?: string;
  toteTemplateId?: string;
}): Promise<AssetPhoto[]> {
  let q = supabase.from("asset_photos").select("*");
  if (params.inventoryItemId) q = q.eq("inventory_item_id", params.inventoryItemId);
  else if (params.trackedAssetId) q = q.eq("tracked_asset_id", params.trackedAssetId);
  else if (params.toteTemplateId) q = q.eq("tote_template_id", params.toteTemplateId);
  else return [];
  // Label sorts before layer alphabetically, which is also the order you want.
  const { data, error } = await q.order("kind").order("layer_index", { nullsFirst: true });
  if (error) throw error;
  return data as AssetPhoto[];
}

/** Upload one tray photo and record what it shows. */
export async function addAssetPhoto(params: {
  file: File;
  territoryId: string;
  inventoryItemId?: string;
  trackedAssetId?: string;
  toteTemplateId?: string;
  kind: AssetPhotoKind;
  layerIndex?: number | null;
  caption?: string | null;
  asReceived?: boolean;
  uploadedBy?: string | null;
}): Promise<AssetPhoto> {
  const url = await uploadItemPhoto(params.file, params.territoryId);
  const { data, error } = await supabase
    .from("asset_photos")
    .insert({
      territory_id: params.territoryId,
      inventory_item_id: params.inventoryItemId ?? null,
      tracked_asset_id: params.trackedAssetId ?? null,
      tote_template_id: params.toteTemplateId ?? null,
      kind: params.kind,
      layer_index: params.kind === "layer" ? (params.layerIndex ?? 1) : null,
      caption: params.caption ?? null,
      as_received: params.asReceived ?? true,
      uploaded_by: params.uploadedBy ?? null,
      url,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AssetPhoto;
}

export async function deleteAssetPhoto(id: string): Promise<void> {
  const { error } = await supabase.from("asset_photos").delete().eq("id", id);
  if (error) throw error;
}

/**
 * The catalog items this territory actually touches, most-used first.
 *
 * A manual "favourites" flag would be one more thing to curate and would go
 * stale the week it stopped being fun. Every item ever stocked already left an
 * inventory_items row carrying its catalog_item_id, so real usage is already
 * recorded -- this just counts it. Roughly 60 REFs out of ~931 come back, which
 * is the difference between a picker you scroll and a picker you scan.
 *
 * Recency-bounded so a product line dropped a year ago stops being "frequent".
 */
export async function listFrequentCatalogItemIds(withinDays = 180): Promise<string[]> {
  const since = new Date(Date.now() - withinDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("catalog_item_id")
    .not("catalog_item_id", "is", null)
    .gte("created_at", since);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { catalog_item_id: string }[]) {
    counts.set(row.catalog_item_id, (counts.get(row.catalog_item_id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/* ------------------------------------------------------------------ *
 * Daily manager report
 * ------------------------------------------------------------------ */

/**
 * The report for a given day, creating the draft on first open.
 *
 * Opening "today" twice must land on the same draft, which is what the unique
 * (territory, author, date) index enforces; the insert is written to tolerate
 * losing that race rather than surfacing a duplicate-key error to a rep who
 * simply double-tapped.
 */
export async function getOrCreateDailyReport(params: {
  territoryId: string;
  authorId: string;
  date: string;
}): Promise<DailyReport> {
  const existing = await supabase
    .from("daily_reports")
    .select("*")
    .eq("author_id", params.authorId)
    .eq("report_date", params.date)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as DailyReport;

  const { data, error } = await supabase
    .from("daily_reports")
    .insert({
      territory_id: params.territoryId,
      author_id: params.authorId,
      report_date: params.date,
    })
    .select("*")
    .single();

  if (error) {
    // Lost the race with another tab or a double tap: read back the winner.
    const retry = await supabase
      .from("daily_reports")
      .select("*")
      .eq("author_id", params.authorId)
      .eq("report_date", params.date)
      .maybeSingle();
    if (retry.data) return retry.data as DailyReport;
    throw error;
  }
  return data as DailyReport;
}

export async function listDailyReports(limit = 60): Promise<DailyReport[]> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as DailyReport[];
}

/** A report with its items and photos — what every screen actually needs. */
export async function getDailyReportFull(reportId: string): Promise<DailyReportFull | null> {
  const [report, items, photos] = await Promise.all([
    supabase.from("daily_reports").select("*").eq("id", reportId).maybeSingle(),
    supabase
      .from("daily_report_items")
      .select("*")
      .eq("report_id", reportId)
      .order("section")
      .order("position"),
    supabase.from("daily_report_photos").select("*").eq("report_id", reportId).order("position"),
  ]);
  if (report.error) throw report.error;
  if (items.error) throw items.error;
  if (photos.error) throw photos.error;
  if (!report.data) return null;
  return {
    ...(report.data as DailyReport),
    items: (items.data ?? []) as DailyReportItem[],
    photos: (photos.data ?? []) as DailyReportPhoto[],
  };
}

export async function updateDailyReport(
  id: string,
  patch: Partial<
    Pick<
      DailyReport,
      | "area"
      | "summary"
      | "important_notes"
      | "status"
      | "sent_at"
      | "sent_to"
      | "sent_method"
      | "acknowledged_at"
      | "acknowledgement_note"
      | "sent_snapshot"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("daily_reports")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function addDailyReportItem(
  input: Omit<DailyReportItem, "id" | "created_at">,
): Promise<DailyReportItem> {
  const { data, error } = await supabase
    .from("daily_report_items")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as DailyReportItem;
}

export async function updateDailyReportItem(
  id: string,
  patch: Partial<Omit<DailyReportItem, "id" | "territory_id" | "report_id" | "created_at">>,
): Promise<void> {
  const { error } = await supabase.from("daily_report_items").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDailyReportItem(id: string): Promise<void> {
  const { error } = await supabase.from("daily_report_items").delete().eq("id", id);
  if (error) throw error;
}

export async function addDailyReportPhoto(
  input: Omit<DailyReportPhoto, "id" | "created_at">,
): Promise<DailyReportPhoto> {
  const { data, error } = await supabase
    .from("daily_report_photos")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as DailyReportPhoto;
}

export async function updateDailyReportPhoto(
  id: string,
  patch: Partial<Pick<DailyReportPhoto, "caption" | "position">>,
): Promise<void> {
  const { error } = await supabase.from("daily_report_photos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDailyReportPhoto(id: string): Promise<void> {
  const { error } = await supabase.from("daily_report_photos").delete().eq("id", id);
  if (error) throw error;
}

/**
 * What happened on a given day, offered to the rep as candidates.
 *
 * Read-only and suggestion-only: nothing here reaches a report until the rep
 * taps it. That is the whole privacy contract of this feature, so this function
 * deliberately returns candidates rather than writing anything.
 */
export interface DailyReportSuggestions {
  tasksDone: PersonalTask[];
  tasksOpen: PersonalTask[];
  cases: CaseRow[];
  movements: Movement[];
  photos: TaskPhoto[];
}

export async function getDailyReportSuggestions(date: string): Promise<DailyReportSuggestions> {
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59.999`;

  const [done, open, cases, movements] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("status", "done")
      .gte("done_at", dayStart)
      .lte("done_at", dayEnd)
      .order("done_at"),
    supabase
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .order("due_date", { nullsFirst: false })
      .limit(50),
    supabase.from("cases").select("*").eq("surgery_date", date).order("surgery_time"),
    supabase
      .from("movements")
      .select("*")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at")
      .limit(50),
  ]);

  if (done.error) throw done.error;
  if (open.error) throw open.error;
  if (cases.error) throw cases.error;
  if (movements.error) throw movements.error;

  const taskIds = (done.data ?? []).map((t: { id: string }) => t.id);
  const photos = taskIds.length ? await listTaskPhotos(taskIds) : [];

  return {
    tasksDone: (done.data ?? []) as PersonalTask[],
    tasksOpen: (open.data ?? []) as PersonalTask[],
    cases: (cases.data ?? []) as CaseRow[],
    movements: (movements.data ?? []) as Movement[],
    photos,
  };
}

/* ------------------------------------------------------------------ *
 * Integration framework
 *
 * Reminder, because it is the one thing that must not drift: `config` holds
 * non-secret settings, `credential_ref` holds the NAME of a Supabase secret,
 * and no function here ever sees a token. Connectors run server-side.
 * ------------------------------------------------------------------ */

export async function listIntegrations(): Promise<IntegrationWithRun[]> {
  const { data, error } = await supabase.from("integrations").select("*").order("display_name");
  if (error) throw error;
  const rows = (data ?? []) as Integration[];
  if (rows.length === 0) return [];

  // One query for every integration's latest run rather than N: this screen
  // renders on open and a request per row is what makes it feel slow.
  const { data: runs, error: runErr } = await supabase
    .from("integration_runs")
    .select("*")
    .in(
      "integration_id",
      rows.map((r) => r.id),
    )
    .order("started_at", { ascending: false });
  if (runErr) throw runErr;

  const latest = new Map<string, IntegrationRun>();
  for (const run of (runs ?? []) as IntegrationRun[]) {
    if (!latest.has(run.integration_id)) latest.set(run.integration_id, run);
  }
  return rows.map((r) => ({ ...r, latest_run: latest.get(r.id) ?? null }));
}

/**
 * Create the row for a provider the first time it is configured.
 *
 * Starts disabled and 'not_configured' on purpose: appearing in the list is
 * not the same as working, and a fresh row must never read as connected.
 */
export async function createIntegration(input: {
  territoryId: string;
  provider: string;
  displayName: string;
  config?: Record<string, unknown>;
  credentialRef?: string | null;
}): Promise<Integration> {
  const { data, error } = await supabase
    .from("integrations")
    .insert({
      territory_id: input.territoryId,
      provider: input.provider,
      display_name: input.displayName,
      config: input.config ?? {},
      credential_ref: input.credentialRef ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Integration;
}

export async function updateIntegration(
  id: string,
  patch: Partial<
    Pick<Integration, "display_name" | "enabled" | "status" | "config" | "credential_ref" | "sync_cursor">
  >,
): Promise<void> {
  const { error } = await supabase
    .from("integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteIntegration(id: string): Promise<void> {
  const { error } = await supabase.from("integrations").delete().eq("id", id);
  if (error) throw error;
}

export async function listIntegrationRuns(
  integrationId: string,
  limit = 20,
): Promise<IntegrationRun[]> {
  const { data, error } = await supabase
    .from("integration_runs")
    .select("*")
    .eq("integration_id", integrationId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as IntegrationRun[];
}

/**
 * Open a run row before the work starts.
 *
 * Written up front so a connector that crashes leaves a visible 'running' row
 * rather than nothing at all -- silence is the failure mode that makes people
 * stop trusting a sync status.
 */
export async function startIntegrationRun(input: {
  territoryId: string;
  integrationId: string;
  kind: IntegrationRunKind;
  trigger?: IntegrationRunTrigger;
  createdBy?: string | null;
}): Promise<IntegrationRun> {
  const { data, error } = await supabase
    .from("integration_runs")
    .insert({
      territory_id: input.territoryId,
      integration_id: input.integrationId,
      kind: input.kind,
      trigger: input.trigger ?? "manual",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as IntegrationRun;
}

/**
 * Close a run and roll its outcome up onto the integration.
 *
 * Both writes happen here so the summary on the integration row cannot drift
 * from the run history that justifies it.
 */
export async function finishIntegrationRun(input: {
  runId: string;
  integrationId: string;
  status: Exclude<IntegrationRunStatus, "running">;
  counts?: Partial<Pick<IntegrationRun, "items_seen" | "items_created" | "items_updated" | "items_skipped">>;
  errorMessage?: string | null;
  errorDetail?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
}): Promise<void> {
  const finishedAt = new Date().toISOString();

  const { error: runErr } = await supabase
    .from("integration_runs")
    .update({
      status: input.status,
      finished_at: finishedAt,
      ...input.counts,
      error_message: input.errorMessage ?? null,
      error_detail: input.errorDetail ?? null,
      summary: input.summary ?? null,
    })
    .eq("id", input.runId);
  if (runErr) throw runErr;

  const succeeded = input.status === "success";
  const { data: current } = await supabase
    .from("integrations")
    .select("consecutive_failures")
    .eq("id", input.integrationId)
    .maybeSingle();
  const failures = (current?.consecutive_failures as number | undefined) ?? 0;

  const { error: intErr } = await supabase
    .from("integrations")
    .update({
      last_attempt_at: finishedAt,
      last_success_at: succeeded ? finishedAt : undefined,
      last_error: succeeded ? null : (input.errorMessage ?? "Failed"),
      consecutive_failures: succeeded ? 0 : failures + 1,
      status: succeeded ? "connected" : "error",
      updated_at: finishedAt,
    })
    .eq("id", input.integrationId);
  if (intErr) throw intErr;
}

/**
 * Ask the server to run a connector.
 *
 * The browser never holds a credential, so it cannot do the work itself: it
 * invokes the edge function with the user's own JWT and reads back what
 * happened. A provider with no connector deployed returns a real error from
 * the server, which is recorded as a real failed run -- deliberately, rather
 * than being smoothed over into a success the screen cannot back up.
 */
export async function invokeIntegrationRun(params: {
  integrationId: string;
  kind: IntegrationRunKind;
}): Promise<{ ok: boolean; message: string; detail?: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke("integration-run", {
    body: { integration_id: params.integrationId, kind: params.kind },
  });
  if (error) {
    return { ok: false, message: error.message || "The integration service could not be reached." };
  }
  const payload = (data ?? {}) as { ok?: boolean; message?: string; detail?: Record<string, unknown> };
  return {
    ok: payload.ok === true,
    message: payload.message ?? (payload.ok ? "Done." : "The connector returned no result."),
    detail: payload.detail,
  };
}

/**
 * Look up what an outside record maps to here.
 *
 * The point of the mapping table: a connector calls this before creating
 * anything, so re-running a sync updates rather than duplicating.
 */
export async function findIntegrationLink(params: {
  integrationId: string;
  externalKind: string;
  externalId: string;
}): Promise<IntegrationLink | null> {
  const { data, error } = await supabase
    .from("integration_links")
    .select("*")
    .eq("integration_id", params.integrationId)
    .eq("external_kind", params.externalKind)
    .eq("external_id", params.externalId)
    .maybeSingle();
  if (error) throw error;
  return (data as IntegrationLink | null) ?? null;
}

/** Records (or refreshes) the mapping between an external record and a local row. */
export async function upsertIntegrationLink(input: {
  territoryId: string;
  integrationId: string;
  externalKind: string;
  externalId: string;
  entityType: string;
  entityId: string;
  externalUpdatedAt?: string | null;
  payloadHash?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("integration_links").upsert(
    {
      territory_id: input.territoryId,
      integration_id: input.integrationId,
      external_kind: input.externalKind,
      external_id: input.externalId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      external_updated_at: input.externalUpdatedAt ?? null,
      payload_hash: input.payloadHash ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "integration_id,external_kind,external_id" },
  );
  if (error) throw error;
}

/**
 * Finds this territory's myOPS integration row, creating it on first use.
 *
 * Mirrors what the Integrations screen does for every provider (see
 * Integrations.tsx's ensureRow) so a rep who has never opened that screen and
 * one who has land on the same row rather than two.
 */
async function ensureMyopsIntegration(territoryId: string): Promise<Integration> {
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("territory_id", territoryId)
    .eq("provider", "myops")
    .maybeSingle();
  if (error) throw error;
  if (data) return data as Integration;
  return createIntegration({
    territoryId,
    provider: "myops",
    displayName: "myOPS",
    credentialRef: "MYOPS_API_TOKEN",
  });
}

/**
 * Cheap, deterministic fingerprint of the fields a myOPS row could change.
 *
 * Not a security hash -- just enough to tell "this case is exactly what it
 * was last import" from "something changed", so re-importing the same export
 * costs zero writes instead of rewriting every row every time. DJB2 over a
 * canonical string is collision-prone in theory; in practice a false match
 * here only means a changed row gets skipped until it changes again in a way
 * that happens to alter the hash too, which for case logistics data is not a
 * real risk worth pulling in a crypto dependency for.
 */
function hashPayload(fields: Record<string, string | number | boolean | null>): string {
  const canonical = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("|");
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = (hash * 33) ^ canonical.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export interface MyopsSyncRow {
  case_id: string;
  surgery_type: "KNEE" | "HIP" | "INSTRUMENT";
  side: "LEFT" | "RIGHT" | null;
  surgery_date: string;
  surgery_time: string | null;
  time_tba: boolean;
  status: "scheduled" | "completed";
  notes: string | null;
  purchase_order_no: string | null;
  invoice_no: string | null;
  billing_status: BillingStatus;
}

export interface MyopsSyncResult {
  runId: string;
  created: number;
  updated: number;
  skipped: number;
}

function myopsHashFields(row: MyopsSyncRow): Record<string, string | number | boolean | null> {
  return {
    surgery_type: row.surgery_type,
    side: row.side,
    surgery_date: row.surgery_date,
    surgery_time: row.surgery_time,
    time_tba: row.time_tba,
    status: row.status,
    notes: row.notes,
    purchase_order_no: row.purchase_order_no,
    invoice_no: row.invoice_no,
    billing_status: row.billing_status,
  };
}

/**
 * Import a myOPS CSV export as a real, logged sync rather than a one-shot
 * insert.
 *
 * Every row with a case_id is linked through integration_links: a case seen
 * before is updated in place (or skipped if nothing changed), a case never
 * seen before -- including one that already exists here from a plain paste
 * import that predates this linking -- is adopted and linked. Only a row with
 * no case_id at all, which can never be matched to anything, is always a
 * fresh insert. The whole import is wrapped in one integration_runs row so
 * "last synced" and "what changed last time" have a real answer.
 */
export async function syncMyopsCases(input: {
  rows: MyopsSyncRow[];
  facilityId: string;
  territoryId: string;
  profileId: string;
}): Promise<MyopsSyncResult> {
  const { rows, facilityId, territoryId, profileId } = input;
  const integration = await ensureMyopsIntegration(territoryId);
  const run = await startIntegrationRun({
    territoryId,
    integrationId: integration.id,
    kind: "sync",
    createdBy: profileId,
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const caseIds = rows.map((r) => r.case_id);

    const links = new Map<string, IntegrationLink>();
    if (caseIds.length > 0) {
      const { data: linkRows, error: linkErr } = await supabase
        .from("integration_links")
        .select("*")
        .eq("integration_id", integration.id)
        .eq("external_kind", "case")
        .in("external_id", caseIds);
      if (linkErr) throw linkErr;
      for (const l of (linkRows ?? []) as IntegrationLink[]) links.set(l.external_id, l);
    }

    // A case with this case_id that predates this framework -- imported by
    // the plain paste path before links existed. Adopt it instead of trying
    // to insert a duplicate the unique case_id would collide on anyway.
    const unlinkedIds = caseIds.filter((id) => !links.has(id));
    const existingByCaseId = new Map<string, CaseRow>();
    if (unlinkedIds.length > 0) {
      const { data: existingRows, error: exErr } = await supabase
        .from("cases")
        .select("*")
        .in("case_id", unlinkedIds);
      if (exErr) throw exErr;
      for (const c of (existingRows ?? []) as CaseRow[]) {
        if (c.case_id) existingByCaseId.set(c.case_id, c);
      }
    }

    const toInsert: BulkCaseInput[] = [];

    for (const row of rows) {
      const hash = hashPayload(myopsHashFields(row));
      const link = links.get(row.case_id);
      const existing = link ? null : (existingByCaseId.get(row.case_id) ?? null);
      const entityId = link?.entity_id ?? existing?.id ?? null;

      if (entityId) {
        if (link && link.payload_hash === hash) {
          skipped++;
          continue;
        }
        await updateCase(entityId, {
          surgery_date: row.surgery_date,
          surgery_time: row.surgery_time,
          time_tba: row.time_tba,
          side: row.side,
          status: row.status,
          notes: row.notes,
        });
        await updateCaseBilling(entityId, {
          purchase_order_no: row.purchase_order_no,
          invoice_no: row.invoice_no,
          billing_status: row.billing_status,
        });
        await upsertIntegrationLink({
          territoryId,
          integrationId: integration.id,
          externalKind: "case",
          externalId: row.case_id,
          entityType: "case",
          entityId,
          payloadHash: hash,
        });
        updated++;
        continue;
      }

      toInsert.push({
        case_id: row.case_id,
        surgery_type: row.surgery_type,
        side: row.side,
        surgery_date: row.surgery_date,
        surgery_time: row.surgery_time,
        time_tba: row.time_tba,
        status: row.status,
        notes: row.notes,
        purchase_order_no: row.purchase_order_no,
        invoice_no: row.invoice_no,
        billing_status: row.billing_status,
        facility_id: facilityId,
        territory_id: territoryId,
        created_by: profileId,
      });
    }

    if (toInsert.length > 0) {
      const { data: insertedRows, error: insErr } = await supabase
        .from("cases")
        .insert(toInsert)
        .select("*");
      if (insErr) throw insErr;
      created += insertedRows?.length ?? 0;

      for (const inserted of (insertedRows ?? []) as CaseRow[]) {
        if (!inserted.case_id) continue;
        const original = rows.find((r) => r.case_id === inserted.case_id);
        if (!original) continue;
        await upsertIntegrationLink({
          territoryId,
          integrationId: integration.id,
          externalKind: "case",
          externalId: inserted.case_id,
          entityType: "case",
          entityId: inserted.id,
          payloadHash: hashPayload(myopsHashFields(original)),
        });
      }
    }

    await finishIntegrationRun({
      runId: run.id,
      integrationId: integration.id,
      status: "success",
      counts: { items_seen: rows.length, items_created: created, items_updated: updated, items_skipped: skipped },
      summary: { created, updated, skipped },
    });

    return { runId: run.id, created, updated, skipped };
  } catch (e) {
    await finishIntegrationRun({
      runId: run.id,
      integrationId: integration.id,
      status: "error",
      errorMessage: e instanceof Error ? e.message : "Sync failed.",
      counts: { items_seen: rows.length, items_created: created, items_updated: updated, items_skipped: skipped },
    });
    throw e;
  }
}
