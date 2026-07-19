import { supabase } from "./supabase";
import type {
  BillingStatus,
  BoardComment,
  BoardPost,
  BoardPostKind,
  CaseItemPlan,
  FacilityCredential,
  QaAnswer,
  QaQuestion,
  RepCertification,
  PersonalTask,
  EntityNote,
  NoteEntityType,
  TaskStatus,
  CaseRow,
  CaseTemplateWithItems,
  CatalogItem,
  CatalogJoint,
  CatalogSide,
  CementType,
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
  photo_url?: string | null;
  acquisition_type?: "consignment" | "loaner";
  loaner_tote_id?: string | null;
  loaner_code?: string | null;
  contents_label?: string | null;
  cement_type?: "cemented" | "cementless" | null;
}

export async function createInventoryItem(input: NewItemInput): Promise<InventoryItem> {
  const { data, error } = await supabase.from("inventory_items").insert(input).select().single();
  if (error) throw error;
  return data as InventoryItem;
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
  catalog_item_id: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  lot_number?: string | null;
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

/** Uploads a reference photo to the public `item-photos` bucket and returns its public URL. */
export async function uploadItemPhoto(file: File, territoryId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${territoryId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("item-photos").upload(path, file);
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
}

export async function updateCaseBilling(
  caseId: string,
  patch: { billing_status?: BillingStatus; purchase_order_no?: string | null; invoice_no?: string | null },
): Promise<void> {
  const { error } = await supabase.from("cases").update(patch).eq("id", caseId);
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
  territory_id: string;
  owner_id: string;
}): Promise<PersonalTask> {
  const { data, error } = await supabase.from("tasks").insert(input).select().single();
  if (error) throw error;
  return data as PersonalTask;
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<PersonalTask, "title" | "notes" | "due_date" | "status" | "shared_with" | "done_at">>,
): Promise<void> {
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw error;
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
