-- 500SPTRR + GSFETIR: Right-side mirrors of 500SPTRL/GSFETIL (both real
-- myOPS exports). Completes the '500 Sphere KA Right Case' procedure.

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint) as (values
('02.12S.506','GMK Sphere Femur S1 to 7R - Ultimate Tibia 1 to 6R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1276','Trial baseplate # Tibia 1 Insert 1R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1278','Trial baseplate # Tibia 2 Insert 2R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1280','Trial baseplate # Tibia 3 Insert 3R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1438','Trial Tibial Tray t4-i3 R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1282','Trial baseplate # Tibia 4 Insert 4R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1284','Trial baseplate # Tibia 5 Insert 5R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1286','Trial baseplate # Tibia 6 Insert 6R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1436','Trial Tibial Tray t3-i4 R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.0004','Trial Femoral Component S2 - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','2','NA','KNEE'),
('02.12.10.0006','Trial Femoral Component S3 - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','3','NA','KNEE'),
('02.12.10.0302','Trial Femoral Component S1+ - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','1+','NA','KNEE'),
('02.12.10.0304','Trial Femoral Component S2+ - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','2+','NA','KNEE'),
('02.12.10.0306','Trial Femoral Component S3+ - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','3+','NA','KNEE'),
('02.12.10.0008','Trial Femoral Component S4 - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','4','NA','KNEE'),
('02.12.10.0010','Trial Femoral Component S5 - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','5','NA','KNEE'),
('02.12.10.0012','Trial Femoral Component S6 - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','6','NA','KNEE'),
('02.12.10.0014','Trial Femoral Component S7 - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','7','NA','KNEE'),
('02.12.10.0308','Trial Femoral Component S4+ - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','4+','NA','KNEE'),
('02.12.10.0310','Trial Femoral Component S5+ - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','5+','NA','KNEE'),
('02.12.10.0312','Trial Femoral Component S6+ - RIGHT','instrument_tray','GMK Sphere Ultimate','NA','6+','NA','KNEE'),
('02.12.10.8506','GMK Sphere Femur S1 to 7R - Ultimate Tibia 1 to 6R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12S.528','GMK Sphere/Spherika Ult Flex E-CROSS Inser trial R','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1733','Ultimate Flex e-cross trial insert S1R- 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1734','Ultimate Flex e-cross trial insert S1R- 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1735','Ultimate Flex e-cross trial insert S1R- 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1736','Ultimate Flex e-cross trial insert S1R- 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1737','Ultimate Flex e-cross trial insert S1R - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1738','Ultimate Flex e-cross trial insert S1R - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1739','Ultimate Flex e-cross trial insert S1R - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1747','Ultimate Flex e-cross trial insert S2R - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1748','Ultimate Flex e-cross trial insert S2R - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1749','Ultimate Flex e-cross trial insert S2R - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1750','Ultimate Flex e-cross trial insert S2R - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1751','Ultimate Flex e-cross trial insert S2R - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1752','Ultimate Flex e-cross trial insert S2R - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1753','Ultimate Flex e-cross trial insert S2R - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1761','Ultimate Flex e-cross trial insert S3R - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1762','Ultimate Flex e-cross trial insert S3R - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1763','Ultimate Flex e-cross trial insert S3R - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1764','Ultimate Flex e-cross trial insert S3R - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1765','Ultimate Flex e-cross trial insert S3R - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1766','Ultimate Flex e-cross trial insert S3R - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1767','Ultimate Flex e-cross trial insert S3R - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1775','Ultimate Flex e-cross trial insert S4R - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1776','Ultimate Flex e-cross trial insert S4R - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1777','Ultimate Flex e-cross trial insert S4R - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1778','Ultimate Flex e-cross trial insert S4R - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1779','Ultimate Flex e-cross trial insert S4R - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1780','Ultimate Flex e-cross trial insert S4R - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1781','Ultimate Flex e-cross trial insert S4R - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1789','Ultimate Flex e-cross trial insert S5R - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1790','Ultimate Flex e-cross trial insert S5R - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1791','Ultimate Flex e-cross trial insert S5R - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1792','Ultimate Flex e-cross trial insert S5R - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1793','Ultimate Flex e-cross trial insert S5R - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1794','Ultimate Flex e-cross trial insert S5R - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1795','Ultimate Flex e-cross trial insert S5R - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1803','Ultimate Flex e-cross trial insert S6R - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1804','Ultimate Flex e-cross trial insert S6R - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1805','Ultimate Flex e-cross trial insert S6R - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1806','Ultimate Flex e-cross trial insert S6R - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1807','Ultimate Flex e-cross trial insert S6R - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1808','Ultimate Flex e-cross trial insert S6R - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1809','Ultimate Flex e-cross trial insert S6R - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.8231','GMK Ultimate Sphere Trial Ins. E-CROSS FLEX R Tray','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

update catalog_items set thickness_mm = v.thickness
from (values
('02.12.10.1733',10),
('02.12.10.1734',11),
('02.12.10.1735',12),
('02.12.10.1736',13),
('02.12.10.1737',14),
('02.12.10.1738',17),
('02.12.10.1739',20),
('02.12.10.1747',10),
('02.12.10.1748',11),
('02.12.10.1749',12),
('02.12.10.1750',13),
('02.12.10.1751',14),
('02.12.10.1752',17),
('02.12.10.1753',20),
('02.12.10.1761',10),
('02.12.10.1762',11),
('02.12.10.1763',12),
('02.12.10.1764',13),
('02.12.10.1765',14),
('02.12.10.1766',17),
('02.12.10.1767',20),
('02.12.10.1775',10),
('02.12.10.1776',11),
('02.12.10.1777',12),
('02.12.10.1778',13),
('02.12.10.1779',14),
('02.12.10.1780',17),
('02.12.10.1781',20),
('02.12.10.1789',10),
('02.12.10.1790',11),
('02.12.10.1791',12),
('02.12.10.1792',13),
('02.12.10.1793',14),
('02.12.10.1794',17),
('02.12.10.1795',20),
('02.12.10.1803',10),
('02.12.10.1804',11),
('02.12.10.1805',12),
('02.12.10.1806',13),
('02.12.10.1807',14),
('02.12.10.1808',17),
('02.12.10.1809',20)
) as v(ref,thickness)
where catalog_items.item_number = v.ref and catalog_items.thickness_mm is distinct from v.thickness::int;

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.07.1201R','GMK Tibial Tray Cemented Right S1','implant','GMK','RIGHT','1','cemented','KNEE','Tibial Tray'),
('02.07.1202R','GMK Tibial Tray Cemented Right S2','implant','GMK','RIGHT','2','cemented','KNEE','Tibial Tray'),
('02.07.1203R','GMK Tibial Tray Cemented Right S3','implant','GMK','RIGHT','3','cemented','KNEE','Tibial Tray'),
('02.07.1204R','GMK Tibial Tray Cemented Right S4','implant','GMK','RIGHT','4','cemented','KNEE','Tibial Tray'),
('02.07.1205R','GMK Tibial Tray Cemented Right S5','implant','GMK','RIGHT','5','cemented','KNEE','Tibial Tray'),
('02.07.1206R','GMK Tibial Tray Cemented Right S6','implant','GMK','RIGHT','6','cemented','KNEE','Tibial Tray'),
('02.07.F11030','Primary Extension Stem Ø11mm L30mm','implant','GMK Sphere','NA','','NA','KNEE','Extension Stem'),
('02.07.F11066','Primary extension stem Ø11mm / L 65mm','implant','GMK Sphere','NA','','NA','KNEE','Extension Stem'),
('02.12.0001R','Sphere Femur Cemented Right S1','implant','GMK Sphere','RIGHT','1','cemented','KNEE','Femoral Component'),
('02.12.0002R','Sphere Femur Cemented Right S2','implant','GMK Sphere','RIGHT','2','cemented','KNEE','Femoral Component'),
('02.12.0003R','Sphere Femur Cemented Right S3','implant','GMK Sphere','RIGHT','3','cemented','KNEE','Femoral Component'),
('02.12.0004R','Sphere Femur Cemented Right S4','implant','GMK Sphere','RIGHT','4','cemented','KNEE','Femoral Component'),
('02.12.0005R','Sphere Femur Cemented Right S5','implant','GMK Sphere','RIGHT','5','cemented','KNEE','Femoral Component'),
('02.12.0006R','Sphere Femur Cemented Right S6','implant','GMK Sphere','RIGHT','6','cemented','KNEE','Femoral Component'),
('02.12.0007R','Sphere Femur Cemented Right S7','implant','GMK Sphere','RIGHT','7','cemented','KNEE','Femoral Component'),
('02.12.0021R','Sphere Femur Cemented Right S1 +','implant','GMK Sphere','RIGHT','1+','cemented','KNEE','Femoral Component'),
('02.12.0022R','Sphere Femur Cemented Right S2 +','implant','GMK Sphere','RIGHT','2+','cemented','KNEE','Femoral Component'),
('02.12.0023R','Sphere Femur Cemented Right S3 +','implant','GMK Sphere','RIGHT','3+','cemented','KNEE','Femoral Component'),
('02.12.0024R','Sphere Femur Cemented Right S4 +','implant','GMK Sphere','RIGHT','4+','cemented','KNEE','Femoral Component'),
('02.12.0025R','Sphere Femur Cemented Right S5 +','implant','GMK Sphere','RIGHT','5+','cemented','KNEE','Femoral Component'),
('02.12.0026R','Sphere Femur Cemented Right S6 +','implant','GMK Sphere','RIGHT','6+','cemented','KNEE','Femoral Component'),
('02.12.E001RP','GMK-SPHERE resurfacing patella E-Cross – S1','implant','GMK Sphere','NA','1','NA','KNEE','Patella'),
('02.12.E002RP','GMK-SPHERE resurfacing patella E-Cross – S2','implant','GMK Sphere','NA','2','NA','KNEE','Patella'),
('02.12.E003RP','GMK-SPHERE resurfacing patella E-Cross – S3','implant','GMK Sphere','NA','3','NA','KNEE','Patella'),
('02.12.E004RP','GMK-SPHERE resurfacing patella E-Cross – S4','implant','GMK Sphere','NA','4','NA','KNEE','Patella'),
('02.12.T3I4R','GMK-SPHERE Tibial component cemented t3i4R','implant','GMK Sphere','RIGHT','T3I4','NA','KNEE','Tibial Insert'),
('02.12.T4I3R','GMK-SPHERE Tibial component cemented t4i3R','implant','GMK Sphere','RIGHT','T4I3','NA','KNEE','Tibial Insert')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint,nullif(d.dtype,'') from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

insert into tote_templates (territory_id,name,reusable,code,content_type)
select t.id, x.name, x.reusable, x.code, x.content_type from (select id from territories order by created_at limit 1) t
cross join (values
  ('INST 500 Sphere Fem/Tib R', true, '500SPTRR', 'instruments'),
  ('Sphere femur (right) cemented & e-cross patella', false, 'GSFETIR', 'implants')
) as x(name, reusable, code, content_type)
where not exists (select 1 from tote_templates y where y.code = x.code and y.territory_id = t.id);

with tt as (select id,territory_id from tote_templates where code='500SPTRR' order by created_at desc limit 1),
l(ref,qty) as (values
('02.12S.506',1),
('02.12.10.1276',1),
('02.12.10.1278',1),
('02.12.10.1280',1),
('02.12.10.1438',1),
('02.12.10.1282',1),
('02.12.10.1284',1),
('02.12.10.1286',1),
('02.12.10.1436',1),
('02.12.10.0004',1),
('02.12.10.0006',1),
('02.12.10.0302',1),
('02.12.10.0304',1),
('02.12.10.0306',1),
('02.12.10.0008',1),
('02.12.10.0010',1),
('02.12.10.0012',1),
('02.12.10.0014',1),
('02.12.10.0308',1),
('02.12.10.0310',1),
('02.12.10.0312',1),
('02.12.10.8506',1),
('02.12S.528',1),
('02.12.10.1733',1),
('02.12.10.1734',1),
('02.12.10.1735',1),
('02.12.10.1736',1),
('02.12.10.1737',1),
('02.12.10.1738',1),
('02.12.10.1739',1),
('02.12.10.1747',1),
('02.12.10.1748',1),
('02.12.10.1749',1),
('02.12.10.1750',1),
('02.12.10.1751',1),
('02.12.10.1752',1),
('02.12.10.1753',1),
('02.12.10.1761',1),
('02.12.10.1762',1),
('02.12.10.1763',1),
('02.12.10.1764',1),
('02.12.10.1765',1),
('02.12.10.1766',1),
('02.12.10.1767',1),
('02.12.10.1775',1),
('02.12.10.1776',1),
('02.12.10.1777',1),
('02.12.10.1778',1),
('02.12.10.1779',1),
('02.12.10.1780',1),
('02.12.10.1781',1),
('02.12.10.1789',1),
('02.12.10.1790',1),
('02.12.10.1791',1),
('02.12.10.1792',1),
('02.12.10.1793',1),
('02.12.10.1794',1),
('02.12.10.1795',1),
('02.12.10.1803',1),
('02.12.10.1804',1),
('02.12.10.1805',1),
('02.12.10.1806',1),
('02.12.10.1807',1),
('02.12.10.1808',1),
('02.12.10.1809',1),
('02.12.10.8231',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

with tt as (select id,territory_id from tote_templates where code='GSFETIR' order by created_at desc limit 1),
l(ref,qty) as (values
('02.07.1201R',1),
('02.07.1202R',1),
('02.07.1203R',1),
('02.07.1204R',1),
('02.07.1205R',1),
('02.07.1206R',1),
('02.07.F11030',1),
('02.07.F11066',1),
('02.12.0001R',1),
('02.12.0002R',1),
('02.12.0003R',1),
('02.12.0004R',1),
('02.12.0005R',1),
('02.12.0006R',1),
('02.12.0007R',1),
('02.12.0021R',1),
('02.12.0022R',1),
('02.12.0023R',1),
('02.12.0024R',1),
('02.12.0025R',1),
('02.12.0026R',1),
('02.12.E001RP',2),
('02.12.E002RP',2),
('02.12.E003RP',2),
('02.12.E004RP',2),
('02.12.T3I4R',1),
('02.12.T4I3R',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

insert into case_templates (territory_id,name,surgery_type,variant,code)
select t.id,'500 Sphere KA Right Case','KNEE','total','500 Sphere KA Right Case'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from case_templates x where x.code='500 Sphere KA Right Case' and x.territory_id=t.id);

with ct as (select id,territory_id from case_templates where code='500 Sphere KA Right Case' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('GSFETIR','GSTIRVE','PATRES','500METAL','500SPTRR','6-1BLKS')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);
