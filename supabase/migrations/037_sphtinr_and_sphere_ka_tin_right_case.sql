with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.07.2801R','Fixed Tibial Tray  Size 1 R - TiNbN Coating','implant','GMK Sphere TiN','RIGHT','1','cementless','KNEE','Tibial Tray'),
('02.07.2802R','Fixed Tibial Tray  Size 2 R - TiNbN Coating','implant','GMK Sphere TiN','RIGHT','2','cementless','KNEE','Tibial Tray'),
('02.07.2803R','Fixed Tibial Tray  Size 3 R - TiNbN Coating','implant','GMK Sphere TiN','RIGHT','3','cementless','KNEE','Tibial Tray'),
('02.07.2804R','Fixed Tibial Tray  Size 4 R - TiNbN Coating','implant','GMK Sphere TiN','RIGHT','4','cementless','KNEE','Tibial Tray'),
('02.07.2805R','Fixed Tibial Tray  Size 5 R - TiNbN Coating','implant','GMK Sphere TiN','RIGHT','5','cementless','KNEE','Tibial Tray'),
('02.07.2806R','Fixed Tibial Tray  Size 6 R - TiNbN Coating','implant','GMK Sphere TiN','RIGHT','6','cementless','KNEE','Tibial Tray'),
('02.12.0701R','GMK-SPHERE Fem Component Cemented TiNbN coated 1R','implant','GMK Sphere TiN','RIGHT','1','cemented','KNEE','Femoral Component'),
('02.12.0702R','GMK-SPHERE Fem Component Cemented TiNbN coated 2R','implant','GMK Sphere TiN','RIGHT','2','cemented','KNEE','Femoral Component'),
('02.12.0703R','GMK-SPHERE Fem Component Cemented TiNbN coated 3R','implant','GMK Sphere TiN','RIGHT','3','cemented','KNEE','Femoral Component'),
('02.12.0704R','GMK-SPHERE Fem Component Cemented TiNbN coated 4R','implant','GMK Sphere TiN','RIGHT','4','cemented','KNEE','Femoral Component'),
('02.12.0705R','GMK-SPHERE Fem Component Cemented TiNbN coated 5R','implant','GMK Sphere TiN','RIGHT','5','cemented','KNEE','Femoral Component'),
('02.12.0706R','GMK-SPHERE Fem Component Cemented TiNbN coated 6R','implant','GMK Sphere TiN','RIGHT','6','cemented','KNEE','Femoral Component'),
('02.12.0707R','GMK-SPHERE Fem Component Cemented TiNbN coated 7R','implant','GMK Sphere TiN','RIGHT','7','cemented','KNEE','Femoral Component'),
('02.12.0721R','GMK-SPHERE Fem Component Cemented TiNbN coated 1+R','implant','GMK Sphere TiN','RIGHT','1+','cemented','KNEE','Femoral Component'),
('02.12.0722R','GMK-SPHERE Fem Component Cemented TiNbN coated 2+R','implant','GMK Sphere TiN','RIGHT','2+','cemented','KNEE','Femoral Component'),
('02.12.0723R','GMK-SPHERE Fem Component Cemented TiNbN coated 3+R','implant','GMK Sphere TiN','RIGHT','3+','cemented','KNEE','Femoral Component'),
('02.12.0724R','GMK-SPHERE Fem Component Cemented TiNbN coated 4+R','implant','GMK Sphere TiN','RIGHT','4+','cemented','KNEE','Femoral Component'),
('02.12.0725R','GMK-SPHERE Fem Component Cemented TiNbN coated 5+R','implant','GMK Sphere TiN','RIGHT','5+','cemented','KNEE','Femoral Component'),
('02.12.0726R','GMK-SPHERE Fem Component Cemented TiNbN coated 6+R','implant','GMK Sphere TiN','RIGHT','6+','cemented','KNEE','Femoral Component'),
('02.12.28T3I4R','GMK-SPHERE Tibial Tray cemented t3i4R TiNbN coated','implant','GMK Sphere TiN','RIGHT','T3I4','cemented','KNEE','Tibial Insert'),
('02.12.28T4I3R','GMK-SPHERE Tibial Tray cemented t4i3R TiNbN coated','implant','GMK Sphere TiN','RIGHT','T4I3','cemented','KNEE','Tibial Insert')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint,nullif(d.dtype,'') from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

insert into tote_templates (territory_id,name,reusable,code,content_type)
select t.id, 'Sphere TiN femur/tibial tray (right) cemented & e-cross patella', false, 'SPHTINR', 'implants'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from tote_templates y where y.code = 'SPHTINR' and y.territory_id = t.id);

with tt as (select id,territory_id from tote_templates where code='SPHTINR' order by created_at desc limit 1),
l(ref,qty) as (values
('02.07.2801R',1),
('02.07.2802R',1),
('02.07.2803R',1),
('02.07.2804R',1),
('02.07.2805R',1),
('02.07.2806R',1),
('02.07.F11030',1),
('02.07.F11066',1),
('02.12.0701R',1),
('02.12.0702R',1),
('02.12.0703R',1),
('02.12.0704R',1),
('02.12.0705R',1),
('02.12.0706R',1),
('02.12.0707R',1),
('02.12.0721R',1),
('02.12.0722R',1),
('02.12.0723R',1),
('02.12.0724R',1),
('02.12.0725R',1),
('02.12.0726R',1),
('02.12.28T3I4R',1),
('02.12.28T4I3R',1),
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
select t.id,'500 Sphere KA TiN Right','KNEE','total','500 Sphere KA TiN Right'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from case_templates x where x.code='500 Sphere KA TiN Right' and x.territory_id=t.id);

with ct as (select id,territory_id from case_templates where code='500 Sphere KA TiN Right' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('SPHTINR','GSTIRVE','PATRES','500METAL','500SPTRR','6-1BLKS')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);
