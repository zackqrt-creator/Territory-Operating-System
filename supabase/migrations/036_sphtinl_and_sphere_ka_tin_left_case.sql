with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.07.2801L','Fixed Tibial Tray  Size 1 L - TiNbN Coating','implant','GMK Sphere TiN','LEFT','1','cementless','KNEE','Tibial Tray'),
('02.07.2802L','Fixed Tibial Tray  Size 2 L - TiNbN Coating','implant','GMK Sphere TiN','LEFT','2','cementless','KNEE','Tibial Tray'),
('02.07.2803L','Fixed Tibial Tray  Size 3 L - TiNbN Coating','implant','GMK Sphere TiN','LEFT','3','cementless','KNEE','Tibial Tray'),
('02.07.2804L','Fixed Tibial Tray  Size 4 L - TiNbN Coating','implant','GMK Sphere TiN','LEFT','4','cementless','KNEE','Tibial Tray'),
('02.07.2805L','Fixed Tibial Tray  Size 5 L - TiNbN Coating','implant','GMK Sphere TiN','LEFT','5','cementless','KNEE','Tibial Tray'),
('02.07.2806L','Fixed Tibial Tray  Size 6 L - TiNbN Coating','implant','GMK Sphere TiN','LEFT','6','cementless','KNEE','Tibial Tray'),
('02.12.0701L','GMK-SPHERE Fem Component Cemented TiNbN coated 1L','implant','GMK Sphere TiN','LEFT','1','cemented','KNEE','Femoral Component'),
('02.12.0702L','GMK-SPHERE Fem Component Cemented TiNbN coated 2L','implant','GMK Sphere TiN','LEFT','2','cemented','KNEE','Femoral Component'),
('02.12.0703L','GMK-SPHERE Fem Component Cemented TiNbN coated 3L','implant','GMK Sphere TiN','LEFT','3','cemented','KNEE','Femoral Component'),
('02.12.0704L','GMK-SPHERE Fem Component Cemented TiNbN coated 4L','implant','GMK Sphere TiN','LEFT','4','cemented','KNEE','Femoral Component'),
('02.12.0705L','GMK-SPHERE Fem Component Cemented TiNbN coated 5L','implant','GMK Sphere TiN','LEFT','5','cemented','KNEE','Femoral Component'),
('02.12.0706L','GMK-SPHERE Fem Component Cemented TiNbN coated 6L','implant','GMK Sphere TiN','LEFT','6','cemented','KNEE','Femoral Component'),
('02.12.0707L','GMK-SPHERE Fem Component Cemented TiNbN coated 7L','implant','GMK Sphere TiN','LEFT','7','cemented','KNEE','Femoral Component'),
('02.12.0721L','GMK-SPHERE Fem Component Cemented TiNbN coated 1+L','implant','GMK Sphere TiN','LEFT','1+','cemented','KNEE','Femoral Component'),
('02.12.0722L','GMK-SPHERE Fem Component Cemented TiNbN coated 2+L','implant','GMK Sphere TiN','LEFT','2+','cemented','KNEE','Femoral Component'),
('02.12.0723L','GMK-SPHERE Fem Component Cemented TiNbN coated 3+L','implant','GMK Sphere TiN','LEFT','3+','cemented','KNEE','Femoral Component'),
('02.12.0724L','GMK-SPHERE Fem Component Cemented TiNbN coated 4+L','implant','GMK Sphere TiN','LEFT','4+','cemented','KNEE','Femoral Component'),
('02.12.0725L','GMK-SPHERE Fem Component Cemented TiNbN coated 5+L','implant','GMK Sphere TiN','LEFT','5+','cemented','KNEE','Femoral Component'),
('02.12.0726L','GMK-SPHERE Fem Component Cemented TiNbN coated 6+L','implant','GMK Sphere TiN','LEFT','6+','cemented','KNEE','Femoral Component'),
('02.12.28T3I4L','GMK-SPHERE Tibial Tray cemented t3i4L TiNbN coated','implant','GMK Sphere TiN','LEFT','T3I4','cemented','KNEE','Tibial Insert'),
('02.12.28T4I3L','GMK-SPHERE Tibial Tray cemented t4i3L TiNbN coated','implant','GMK Sphere TiN','LEFT','T4I3','cemented','KNEE','Tibial Insert')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint,nullif(d.dtype,'') from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

insert into tote_templates (territory_id,name,reusable,code,content_type)
select t.id, 'Sphere TiN femur/tibial tray (left) cemented & e-cross patella', false, 'SPHTINL', 'implants'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from tote_templates y where y.code = 'SPHTINL' and y.territory_id = t.id);

with tt as (select id,territory_id from tote_templates where code='SPHTINL' order by created_at desc limit 1),
l(ref,qty) as (values
('02.07.2801L',1),
('02.07.2802L',1),
('02.07.2803L',1),
('02.07.2804L',1),
('02.07.2805L',1),
('02.07.2806L',1),
('02.07.F11030',1),
('02.07.F11066',1),
('02.12.0701L',1),
('02.12.0702L',1),
('02.12.0703L',1),
('02.12.0704L',1),
('02.12.0705L',1),
('02.12.0706L',1),
('02.12.0707L',1),
('02.12.0721L',1),
('02.12.0722L',1),
('02.12.0723L',1),
('02.12.0724L',1),
('02.12.0725L',1),
('02.12.0726L',1),
('02.12.28T3I4L',1),
('02.12.28T4I3L',1),
('02.12.E001RP',2),
('02.12.E002RP',2),
('02.12.E003RP',2),
('02.12.E004RP',2)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

insert into case_templates (territory_id,name,surgery_type,variant,code)
select t.id,'500 Sphere KA TiN Left','KNEE','total','500 Sphere KA TiN Left'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from case_templates x where x.code='500 Sphere KA TiN Left' and x.territory_id=t.id);

with ct as (select id,territory_id from case_templates where code='500 Sphere KA TiN Left' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('SPHTINL','GSTILVE','PATRES','500METAL','500SPTRL','6-1BLKS')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);
