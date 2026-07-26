-- GSKAIMPL load: 25 catalog items + the set (menu) + its packing list
with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.07.1201L','GMK Tibial Tray Cemented Left S1','implant','GMK','LEFT','1','cemented','KNEE','Tibial Tray'),
('02.07.1202L','GMK Tibial Tray Cemented Left S2','implant','GMK','LEFT','2','cemented','KNEE','Tibial Tray'),
('02.07.1203L','GMK Tibial Tray Cemented Left S3','implant','GMK','LEFT','3','cemented','KNEE','Tibial Tray'),
('02.07.1204L','GMK Tibial Tray Cemented Left S4','implant','GMK','LEFT','4','cemented','KNEE','Tibial Tray'),
('02.07.1205L','GMK Tibial Tray Cemented Left S5','implant','GMK','LEFT','5','cemented','KNEE','Tibial Tray'),
('02.07.1206L','GMK Tibial Tray Cemented Left S6','implant','GMK','LEFT','6','cemented','KNEE','Tibial Tray'),
('02.12.E001RP','GMK-SPHERE resurfacing patella E-Cross – S1','implant','GMK Sphere','NA','1','NA','KNEE','Patella'),
('02.12.E002RP','GMK-SPHERE resurfacing patella E-Cross – S2','implant','GMK Sphere','NA','2','NA','KNEE','Patella'),
('02.12.E003RP','GMK-SPHERE resurfacing patella E-Cross – S3','implant','GMK Sphere','NA','3','NA','KNEE','Patella'),
('02.12.E004RP','GMK-SPHERE resurfacing patella E-Cross – S4','implant','GMK Sphere','NA','4','NA','KNEE','Patella'),
('02.12.KA01L','GMK Spherika femoral component S1L Cemented','implant','GMK Spherika','LEFT','1','cemented','KNEE','Femoral Component'),
('02.12.KA02L','GMK Spherika femoral component S2L Cemented','implant','GMK Spherika','LEFT','2','cemented','KNEE','Femoral Component'),
('02.12.KA03L','GMK Spherika femoral component S3L Cemented','implant','GMK Spherika','LEFT','3','cemented','KNEE','Femoral Component'),
('02.12.KA04L','GMK Spherika femoral component S4L Cemented','implant','GMK Spherika','LEFT','4','cemented','KNEE','Femoral Component'),
('02.12.KA05L','GMK Spherika femoral component S5L Cemented','implant','GMK Spherika','LEFT','5','cemented','KNEE','Femoral Component'),
('02.12.KA06L','GMK Spherika femoral component S6L Cemented','implant','GMK Spherika','LEFT','6','cemented','KNEE','Femoral Component'),
('02.12.KA07L','GMK Spherika femoral component S7L Cemented','implant','GMK Spherika','LEFT','7','cemented','KNEE','Femoral Component'),
('02.12.KA11L','GMK Spherika femoral component S1+L Cemented','implant','GMK Spherika','LEFT','1+','cemented','KNEE','Femoral Component'),
('02.12.KA12L','GMK Spherika femoral component S2+L Cemented','implant','GMK Spherika','LEFT','2+','cemented','KNEE','Femoral Component'),
('02.12.KA13L','GMK Spherika femoral component S3+L Cemented','implant','GMK Spherika','LEFT','3+','cemented','KNEE','Femoral Component'),
('02.12.KA14L','GMK Spherika femoral component S4+L Cemented','implant','GMK Spherika','LEFT','4+','cemented','KNEE','Femoral Component'),
('02.12.KA15L','GMK Spherika femoral component S5+L Cemented','implant','GMK Spherika','LEFT','5+','cemented','KNEE','Femoral Component'),
('02.12.KA16L','GMK Spherika femoral component S6+L Cemented','implant','GMK Spherika','LEFT','6+','cemented','KNEE','Femoral Component'),
('02.12.T3I4L','GMK-SPHERE Tibial component cemented t3i4L','implant','GMK Sphere','LEFT','t3i4','cemented','KNEE','Tibial Insert'),
('02.12.T4I3L','GMK-SPHERE Tibial component cemented t4i3L','implant','GMK Sphere','LEFT','t4i3','cemented','KNEE','Tibial Insert')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,d.size,d.cement,d.joint,d.dtype from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

insert into tote_templates (territory_id,name,reusable,code,content_type)
select t.id,'imp Spherika fem/tibs (left) & e-cross patella',false,'GSKAIMPL','implants'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from tote_templates x where x.code='GSKAIMPL' and x.territory_id=t.id);

with tt as (select id,territory_id from tote_templates where code='GSKAIMPL' order by created_at desc limit 1),
l(ref,qty) as (values
('02.07.1201L',1),
('02.07.1202L',1),
('02.07.1203L',1),
('02.07.1204L',1),
('02.07.1205L',1),
('02.07.1206L',1),
('02.12.E001RP',2),
('02.12.E002RP',2),
('02.12.E003RP',2),
('02.12.E004RP',2),
('02.12.KA01L',1),
('02.12.KA02L',1),
('02.12.KA03L',1),
('02.12.KA04L',1),
('02.12.KA05L',1),
('02.12.KA06L',1),
('02.12.KA07L',1),
('02.12.KA11L',1),
('02.12.KA12L',1),
('02.12.KA13L',1),
('02.12.KA14L',1),
('02.12.KA15L',1),
('02.12.KA16L',1),
('02.12.T3I4L',1),
('02.12.T4I3L',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);
