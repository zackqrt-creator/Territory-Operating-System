-- GSKAIMPR + GSTIRVE (Right-side mirrors of GSKAIMPL, plus tibial inserts)
-- and the '500 GMK SpheriKA Right' Procedure -> 6 Sets mapping.
with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.07.1201R','GMK Tibial Tray Cemented Right S1','implant','GMK','RIGHT','1','cemented','KNEE','Tibial Tray'),
('02.07.1202R','GMK Tibial Tray Cemented Right S2','implant','GMK','RIGHT','2','cemented','KNEE','Tibial Tray'),
('02.07.1203R','GMK Tibial Tray Cemented Right S3','implant','GMK','RIGHT','3','cemented','KNEE','Tibial Tray'),
('02.07.1204R','GMK Tibial Tray Cemented Right S4','implant','GMK','RIGHT','4','cemented','KNEE','Tibial Tray'),
('02.07.1205R','GMK Tibial Tray Cemented Right S5','implant','GMK','RIGHT','5','cemented','KNEE','Tibial Tray'),
('02.07.1206R','GMK Tibial Tray Cemented Right S6','implant','GMK','RIGHT','6','cemented','KNEE','Tibial Tray'),
('02.12.E001RP','GMK-SPHERE resurfacing patella E-Cross – S1','implant','GMK Sphere','NA','1','NA','KNEE','Patella'),
('02.12.E002RP','GMK-SPHERE resurfacing patella E-Cross – S2','implant','GMK Sphere','NA','2','NA','KNEE','Patella'),
('02.12.E003RP','GMK-SPHERE resurfacing patella E-Cross – S3','implant','GMK Sphere','NA','3','NA','KNEE','Patella'),
('02.12.E004RP','GMK-SPHERE resurfacing patella E-Cross – S4','implant','GMK Sphere','NA','4','NA','KNEE','Patella'),
('02.12.KA01R','GMK Spherika femoral component S1R Cemented','implant','GMK Spherika','RIGHT','1','cemented','KNEE','Femoral Component'),
('02.12.KA02R','GMK Spherika femoral component S2R Cemented','implant','GMK Spherika','RIGHT','2','cemented','KNEE','Femoral Component'),
('02.12.KA03R','GMK Spherika femoral component S3R Cemented','implant','GMK Spherika','RIGHT','3','cemented','KNEE','Femoral Component'),
('02.12.KA04R','GMK Spherika femoral component S4R Cemented','implant','GMK Spherika','RIGHT','4','cemented','KNEE','Femoral Component'),
('02.12.KA05R','GMK Spherika femoral component S5R Cemented','implant','GMK Spherika','RIGHT','5','cemented','KNEE','Femoral Component'),
('02.12.KA06R','GMK Spherika femoral component S6R Cemented','implant','GMK Spherika','RIGHT','6','cemented','KNEE','Femoral Component'),
('02.12.KA07R','GMK Spherika femoral component S7R Cemented','implant','GMK Spherika','RIGHT','7','cemented','KNEE','Femoral Component'),
('02.12.KA11R','GMK Spherika femoral component S1+R Cemented','implant','GMK Spherika','RIGHT','1+','cemented','KNEE','Femoral Component'),
('02.12.KA12R','GMK Spherika femoral component S2+R Cemented','implant','GMK Spherika','RIGHT','2+','cemented','KNEE','Femoral Component'),
('02.12.KA13R','GMK Spherika femoral component S3+R Cemented','implant','GMK Spherika','RIGHT','3+','cemented','KNEE','Femoral Component'),
('02.12.KA14R','GMK Spherika femoral component S4+R Cemented','implant','GMK Spherika','RIGHT','4+','cemented','KNEE','Femoral Component'),
('02.12.KA15R','GMK Spherika femoral component S5+R Cemented','implant','GMK Spherika','RIGHT','5+','cemented','KNEE','Femoral Component'),
('02.12.KA16R','GMK Spherika femoral component S6+R Cemented','implant','GMK Spherika','RIGHT','6+','cemented','KNEE','Femoral Component'),
('02.12.T3I4R','GMK-SPHERE Tibial component cemented t3i4R','implant','GMK Sphere','RIGHT','T3I4','NA','KNEE','Tibial Insert'),
('02.12.T4I3R','GMK-SPHERE Tibial component cemented t4i3R','implant','GMK Sphere','RIGHT','T4I3','NA','KNEE','Tibial Insert'),
('02.12.E0210FR','GMK-SPHERE tibial insert E-Cross - Flex 2R - 10mm','implant','GMK Sphere','RIGHT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0211FR','GMK-SPHERE tibial insert E-Cross - Flex 2R - 11mm','implant','GMK Sphere','RIGHT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0212FR','GMK-SPHERE tibial insert E-Cross - Flex 2R - 12mm','implant','GMK Sphere','RIGHT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0213FR','GMK-SPHERE tibial insert E-Cross - Flex 2R - 13mm','implant','GMK Sphere','RIGHT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0214FR','GMK-SPHERE tibial insert E-Cross - Flex 2R - 14mm','implant','GMK Sphere','RIGHT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0310FR','GMK-SPHERE tibial insert E-Cross - Flex 3R - 10mm','implant','GMK Sphere','RIGHT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0311FR','GMK-SPHERE tibial insert E-Cross - Flex 3R - 11mm','implant','GMK Sphere','RIGHT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0312FR','GMK-SPHERE tibial insert E-Cross - Flex 3R - 12mm','implant','GMK Sphere','RIGHT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0313FR','GMK-SPHERE tibial insert E-Cross - Flex 3R - 13mm','implant','GMK Sphere','RIGHT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0314FR','GMK-SPHERE tibial insert E-Cross - Flex 3R - 14mm','implant','GMK Sphere','RIGHT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0410FR','GMK-SPHERE tibial insert E-Cross - Flex 4R - 10mm','implant','GMK Sphere','RIGHT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0411FR','GMK-SPHERE tibial insert E-Cross - Flex 4R - 11mm','implant','GMK Sphere','RIGHT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0412FR','GMK-SPHERE tibial insert E-Cross - Flex 4R - 12mm','implant','GMK Sphere','RIGHT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0413FR','GMK-SPHERE tibial insert E-Cross - Flex 4R - 13mm','implant','GMK Sphere','RIGHT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0414FR','GMK-SPHERE tibial insert E-Cross - Flex 4R - 14mm','implant','GMK Sphere','RIGHT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0510FR','GMK-SPHERE tibial insert E-Cross - Flex 5R - 10mm','implant','GMK Sphere','RIGHT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0511FR','GMK-SPHERE tibial insert E-Cross - Flex 5R - 11mm','implant','GMK Sphere','RIGHT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0512FR','GMK-SPHERE tibial insert E-Cross - Flex 5R - 12mm','implant','GMK Sphere','RIGHT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0513FR','GMK-SPHERE tibial insert E-Cross - Flex 5R - 13mm','implant','GMK Sphere','RIGHT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0514FR','GMK-SPHERE tibial insert E-Cross - Flex 5R - 14mm','implant','GMK Sphere','RIGHT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0610FR','GMK-SPHERE tibial insert E-Cross - Flex 6R - 10mm','implant','GMK Sphere','RIGHT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0611FR','GMK-SPHERE tibial insert E-Cross - Flex 6R - 11mm','implant','GMK Sphere','RIGHT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0612FR','GMK-SPHERE tibial insert E-Cross - Flex 6R - 12mm','implant','GMK Sphere','RIGHT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0613FR','GMK-SPHERE tibial insert E-Cross - Flex 6R - 13mm','implant','GMK Sphere','RIGHT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0614FR','GMK-SPHERE tibial insert E-Cross - Flex 6R - 14mm','implant','GMK Sphere','RIGHT','Flex 6','NA','KNEE','Tibial Insert')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,d.size,d.cement,d.joint,d.dtype from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

-- Set thickness_mm on the tibial insert items (not expressible in the VALUES insert above)
update catalog_items set thickness_mm = v.thickness
from (values
('02.12.E0210FR',10),
('02.12.E0211FR',11),
('02.12.E0212FR',12),
('02.12.E0213FR',13),
('02.12.E0214FR',14),
('02.12.E0310FR',10),
('02.12.E0311FR',11),
('02.12.E0312FR',12),
('02.12.E0313FR',13),
('02.12.E0314FR',14),
('02.12.E0410FR',10),
('02.12.E0411FR',11),
('02.12.E0412FR',12),
('02.12.E0413FR',13),
('02.12.E0414FR',14),
('02.12.E0510FR',10),
('02.12.E0511FR',11),
('02.12.E0512FR',12),
('02.12.E0513FR',13),
('02.12.E0514FR',14),
('02.12.E0610FR',10),
('02.12.E0611FR',11),
('02.12.E0612FR',12),
('02.12.E0613FR',13),
('02.12.E0614FR',14)
) as v(ref,thickness)
where catalog_items.item_number = v.ref and catalog_items.thickness_mm is distinct from v.thickness;

insert into tote_templates (territory_id,name,reusable,code,content_type)
select t.id, x.name, x.reusable, x.code, x.content_type from (select id from territories order by created_at limit 1) t
cross join (values
  ('imp fem/tibs (Right) & e-cross patella', false, 'GSKAIMPR', 'implants'),
  ('SPH Vit-E Tib Inserts Right (Sz 2-6 10mm-14mm)-1', false, 'GSTIRVE', 'implants'),
  ('INST - PATELLA RESURFACING', true, 'PATRES', 'instruments'),
  ('INST 500 General Inst Trays', true, '500METAL', 'instruments'),
  ('INST 500 Spherika Fem/Tib R', true, '500KATRR', 'instruments'),
  ('INST SPHERE ALLINONE BLKS', true, '6-1BLKS', 'instruments')
) as x(name, reusable, code, content_type)
where not exists (select 1 from tote_templates y where y.code = x.code and y.territory_id = t.id);

with tt as (select id,territory_id from tote_templates where code='GSKAIMPR' order by created_at desc limit 1),
l(ref,qty) as (values
('02.07.1201R',1),
('02.07.1202R',1),
('02.07.1203R',1),
('02.07.1204R',1),
('02.07.1205R',1),
('02.07.1206R',1),
('02.12.E001RP',2),
('02.12.E002RP',2),
('02.12.E003RP',2),
('02.12.E004RP',2),
('02.12.KA01R',1),
('02.12.KA02R',1),
('02.12.KA03R',1),
('02.12.KA04R',1),
('02.12.KA05R',1),
('02.12.KA06R',1),
('02.12.KA07R',1),
('02.12.KA11R',1),
('02.12.KA12R',1),
('02.12.KA13R',1),
('02.12.KA14R',1),
('02.12.KA15R',1),
('02.12.KA16R',1),
('02.12.T3I4R',1),
('02.12.T4I3R',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

with tt as (select id,territory_id from tote_templates where code='GSTIRVE' order by created_at desc limit 1),
l(ref,qty) as (values
('02.12.E0210FR',1),
('02.12.E0211FR',1),
('02.12.E0212FR',1),
('02.12.E0213FR',1),
('02.12.E0214FR',1),
('02.12.E0310FR',1),
('02.12.E0311FR',1),
('02.12.E0312FR',1),
('02.12.E0313FR',1),
('02.12.E0314FR',1),
('02.12.E0410FR',1),
('02.12.E0411FR',1),
('02.12.E0412FR',1),
('02.12.E0413FR',1),
('02.12.E0414FR',1),
('02.12.E0510FR',1),
('02.12.E0511FR',1),
('02.12.E0512FR',1),
('02.12.E0513FR',1),
('02.12.E0514FR',1),
('02.12.E0610FR',1),
('02.12.E0611FR',1),
('02.12.E0612FR',1),
('02.12.E0613FR',1),
('02.12.E0614FR',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

insert into case_templates (territory_id,name,surgery_type,variant,code)
select t.id,'500 GMK SpheriKA Right','KNEE','total','500 GMK SpheriKA Right'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from case_templates x where x.code='500 GMK SpheriKA Right' and x.territory_id=t.id);

with ct as (select id,territory_id from case_templates where code='500 GMK SpheriKA Right' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('GSKAIMPR','GSTIRVE','PATRES','500METAL','500KATRR','6-1BLKS')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);
