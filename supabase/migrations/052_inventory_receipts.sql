-- Auditable receiving: a draft header owns shipment lines and private source
-- documents; posting once creates inventory and movement history atomically.

create table public.inventory_receipts (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references public.territories(id) on delete cascade,
  receiving_location_id uuid not null references public.facilities(id),
  status text not null default 'draft' check (status in ('draft','posted','voided')),
  source_type text not null default 'company_shipment'
    check (source_type in ('company_shipment','loaner','transfer','return','other')),
  vendor_name text,
  packing_slip_number text,
  tracking_number text,
  received_at timestamptz not null default now(),
  received_by uuid not null default auth.uid() references public.profiles(id),
  notes text,
  posted_at timestamptz,
  posted_by uuid references public.profiles(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'posted' or (posted_at is not null and posted_by is not null)),
  check (status <> 'voided' or (voided_at is not null and voided_by is not null and nullif(btrim(void_reason),'') is not null))
);

create table public.inventory_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.inventory_receipts(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  catalog_item_id uuid references public.catalog_items(id),
  item_number text,
  item_name text not null,
  category text not null default 'implant'
    check (category in ('loaner_kit','instrument_tray','implant','consumable')),
  quantity_expected integer check (quantity_expected is null or quantity_expected >= 0),
  quantity_received integer not null default 1 check (quantity_received > 0),
  lot_number text,
  expiration_date date,
  barcode_value text,
  acquisition_type text not null default 'consignment'
    check (acquisition_type in ('consignment','loaner')),
  discrepancy_note text,
  inventory_item_id uuid references public.inventory_items(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, line_number)
);

create table public.inventory_receipt_attachments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.inventory_receipts(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  kind text not null default 'packing_slip'
    check (kind in ('packing_slip','box_photo','item_photo','spreadsheet','other')),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  caption text,
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index inventory_receipts_territory_received_idx on public.inventory_receipts (territory_id, received_at desc);
create index inventory_receipts_location_status_idx on public.inventory_receipts (receiving_location_id, status);
create index inventory_receipt_lines_receipt_idx on public.inventory_receipt_lines (receipt_id, line_number);
create index inventory_receipt_lines_catalog_idx on public.inventory_receipt_lines (catalog_item_id);
create index inventory_receipt_attachments_receipt_idx on public.inventory_receipt_attachments (receipt_id, created_at);

create function public.touch_inventory_receipt_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger inventory_receipts_touch_updated_at before update on public.inventory_receipts
for each row execute function public.touch_inventory_receipt_updated_at();
create trigger inventory_receipt_lines_touch_updated_at before update on public.inventory_receipt_lines
for each row execute function public.touch_inventory_receipt_updated_at();

create function public.enforce_inventory_receipt_line_territory() returns trigger
language plpgsql set search_path = public as $$
declare parent_territory uuid; catalog_territory uuid;
begin
  select territory_id into parent_territory from public.inventory_receipts where id=new.receipt_id;
  if parent_territory is null or new.territory_id <> parent_territory then
    raise exception 'Receipt line territory must match its receipt';
  end if;
  if new.catalog_item_id is not null then
    select territory_id into catalog_territory from public.catalog_items where id=new.catalog_item_id;
    if catalog_territory is null or catalog_territory <> new.territory_id then
      raise exception 'Catalog item territory must match receipt territory';
    end if;
  end if;
  return new;
end;
$$;
create trigger inventory_receipt_lines_enforce_territory before insert or update
on public.inventory_receipt_lines for each row execute function public.enforce_inventory_receipt_line_territory();

create function public.enforce_inventory_receipt_attachment_territory() returns trigger
language plpgsql set search_path = public as $$
declare parent_territory uuid;
begin
  select territory_id into parent_territory from public.inventory_receipts where id=new.receipt_id;
  if parent_territory is null or new.territory_id <> parent_territory then
    raise exception 'Receipt attachment territory must match its receipt';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.territory_id::text then
    raise exception 'Receipt attachment path must begin with the territory id';
  end if;
  return new;
end;
$$;
create trigger inventory_receipt_attachments_enforce_territory before insert or update
on public.inventory_receipt_attachments for each row execute function public.enforce_inventory_receipt_attachment_territory();

alter table public.inventory_receipts enable row level security;
alter table public.inventory_receipt_lines enable row level security;
alter table public.inventory_receipt_attachments enable row level security;

create policy inventory_receipts_select on public.inventory_receipts for select using (territory_id=public.my_territory_id());
create policy inventory_receipts_insert on public.inventory_receipts for insert with check (territory_id=public.my_territory_id() and received_by=auth.uid() and status='draft');
create policy inventory_receipts_update on public.inventory_receipts for update using (territory_id=public.my_territory_id() and status='draft') with check (territory_id=public.my_territory_id());
create policy inventory_receipts_delete on public.inventory_receipts for delete using (territory_id=public.my_territory_id() and status='draft' and received_by=auth.uid());
create policy inventory_receipt_lines_select on public.inventory_receipt_lines for select using (territory_id=public.my_territory_id());
create policy inventory_receipt_lines_insert on public.inventory_receipt_lines for insert with check (territory_id=public.my_territory_id() and exists (select 1 from public.inventory_receipts r where r.id=receipt_id and r.status='draft'));
create policy inventory_receipt_lines_update on public.inventory_receipt_lines for update using (territory_id=public.my_territory_id() and exists (select 1 from public.inventory_receipts r where r.id=receipt_id and r.status='draft')) with check (territory_id=public.my_territory_id());
create policy inventory_receipt_lines_delete on public.inventory_receipt_lines for delete using (territory_id=public.my_territory_id() and exists (select 1 from public.inventory_receipts r where r.id=receipt_id and r.status='draft'));
create policy inventory_receipt_attachments_select on public.inventory_receipt_attachments for select using (territory_id=public.my_territory_id());
create policy inventory_receipt_attachments_insert on public.inventory_receipt_attachments for insert with check (territory_id=public.my_territory_id() and uploaded_by=auth.uid() and exists (select 1 from public.inventory_receipts r where r.id=receipt_id and r.status='draft'));
create policy inventory_receipt_attachments_update on public.inventory_receipt_attachments for update using (territory_id=public.my_territory_id() and uploaded_by=auth.uid() and exists (select 1 from public.inventory_receipts r where r.id=receipt_id and r.status='draft')) with check (territory_id=public.my_territory_id());
create policy inventory_receipt_attachments_delete on public.inventory_receipt_attachments for delete using (territory_id=public.my_territory_id() and uploaded_by=auth.uid() and exists (select 1 from public.inventory_receipts r where r.id=receipt_id and r.status='draft'));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
('receipt-attachments','receipt-attachments',false,15728640,
 array['image/jpeg','image/png','image/heic','image/heif','application/pdf','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
create policy receipt_attachments_storage_select on storage.objects for select to authenticated using (bucket_id='receipt-attachments' and (storage.foldername(name))[1]=public.my_territory_id()::text);
create policy receipt_attachments_storage_insert on storage.objects for insert to authenticated with check (bucket_id='receipt-attachments' and (storage.foldername(name))[1]=public.my_territory_id()::text);
create policy receipt_attachments_storage_update on storage.objects for update to authenticated using (bucket_id='receipt-attachments' and (storage.foldername(name))[1]=public.my_territory_id()::text) with check (bucket_id='receipt-attachments' and (storage.foldername(name))[1]=public.my_territory_id()::text);
create policy receipt_attachments_storage_delete on storage.objects for delete to authenticated using (bucket_id='receipt-attachments' and (storage.foldername(name))[1]=public.my_territory_id()::text);

create function public.post_inventory_receipt(p_receipt_id uuid)
returns public.inventory_receipts language plpgsql security invoker set search_path=public as $$
declare receipt public.inventory_receipts; receipt_line public.inventory_receipt_lines;
  new_inventory_id uuid; line_count integer;
begin
  select * into receipt from public.inventory_receipts
  where id=p_receipt_id and territory_id=public.my_territory_id() for update;
  if receipt.id is null then raise exception 'Receipt not found'; end if;
  if receipt.status <> 'draft' then raise exception 'Only draft receipts can be posted'; end if;
  select count(*) into line_count from public.inventory_receipt_lines where receipt_id=receipt.id;
  if line_count=0 then raise exception 'Receipt must contain at least one line'; end if;

  for receipt_line in select * from public.inventory_receipt_lines
    where receipt_id=receipt.id order by line_number for update loop
    if receipt_line.inventory_item_id is not null then
      raise exception 'Receipt line % has already changed inventory', receipt_line.line_number;
    end if;
    insert into public.inventory_items
      (territory_id,name,category,lot_number,barcode_value,location_id,quantity,
       expiration_date,catalog_item_id,acquisition_type,delivery_status)
    values
      (receipt.territory_id,receipt_line.item_name,receipt_line.category,
       receipt_line.lot_number,receipt_line.barcode_value,receipt.receiving_location_id,
       receipt_line.quantity_received,receipt_line.expiration_date,
       receipt_line.catalog_item_id,receipt_line.acquisition_type,'delivered')
    returning id into new_inventory_id;
    update public.inventory_receipt_lines set inventory_item_id=new_inventory_id where id=receipt_line.id;
    insert into public.movements
      (territory_id,item_id,from_location,to_location,moved_by,note,tracking_number,acknowledged_at,acknowledged_by)
    values
      (receipt.territory_id,new_inventory_id,null,receipt.receiving_location_id,auth.uid(),
       'Received via shipment receipt '||receipt.id::text||case when receipt.packing_slip_number is not null then ' (packing slip '||receipt.packing_slip_number||')' else '' end,
       receipt.tracking_number,now(),auth.uid());
  end loop;
  update public.inventory_receipts set status='posted',posted_at=now(),posted_by=auth.uid()
  where id=receipt.id returning * into receipt;
  return receipt;
end;
$$;
grant execute on function public.post_inventory_receipt(uuid) to authenticated;
