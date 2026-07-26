-- GSFETIL (plain GMK Sphere femurs, non-Spherika/non-KA) + 500SPTRL
-- (Sphere-specific Left femoral trial tray -- distinct from 500KATRL's
-- Spherika trials, confirmed via myOPS packing-list screenshot) --
-- completes the '500 Sphere KA Left Case' procedure, all 6 Sets.

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.07.1201L','GMK Tibial Tray Cemented Left S1','implant','GMK','LEFT','1','cemented','KNEE','Tibial Tray'),
('02.07.1202L','GMK Tibial Tray Cemented Left S2','implant','GMK','LEFT','2','cemented','KNEE','Tibial Tray'),
('02.07.1203L','GMK Tibial Tray Cemented Left S3','implant','GMK','LEFT','3','cemented','KNEE','Tibial Tray'),
('02.07.1204L','GMK Tibial Tray Cemented Left S4','implant','GMK','LEFT','4','cemented','KNEE','Tibial Tray'),
('02.07.1205L','GMK Tibial Tray Cemented Left S5','implant','GMK','LEFT','5','cemented','KNEE','Tibial Tray'),
('02.07.1206L','GMK Tibial Tray Cemented Left S6','implant','GMK','LEFT','6','cemented','KNEE','Tibial Tray'),
('02.07.F11030','Primary Extension Stem Ø11mm L30mm','implant','GMK Sphere','LEFT','','NA','KNEE','Extension Stem'),
('02.07.F11066','Primary extension stem Ø11mm / L 65mm','implant','GMK Sphere','LEFT','','NA','KNEE','Extension Stem'),
('02.12.0001L','Sphere Femur Cemented Left S1','implant','GMK Sphere','LEFT','1','cemented','KNEE','Femoral Component'),
('02.12.0002L','Sphere Femur Cemented Left S2','implant','GMK Sphere','LEFT','2','cemented','KNEE','Femoral Component'),
('02.12.0003L','Sphere Femur Cemented Left S3','implant','GMK Sphere','LEFT','3','cemented','KNEE','Femoral Component'),
('02.12.0004L','Sphere Femur Cemented Left S4','implant','GMK Sphere','LEFT','4','cemented','KNEE','Femoral Component'),
('02.12.0005L','Sphere Femur Cemented Left S5','implant','GMK Sphere','LEFT','5','cemented','KNEE','Femoral Component'),
('02.12.0006L','Sphere Femur Cemented Left S6','implant','GMK Sphere','LEFT','6','cemented','KNEE','Femoral Component'),
('02.12.0007L','Sphere Femur Cemented Left S7','implant','GMK Sphere','LEFT','7','cemented','KNEE','Femoral Component'),
('02.12.0021L','Sphere Femur Cemented Left S1 +','implant','GMK Sphere','LEFT','1+','cemented','KNEE','Femoral Component'),
('02.12.0022L','Sphere Femur Cemented Left S2 +','implant','GMK Sphere','LEFT','2+','cemented','KNEE','Femoral Component'),
('02.12.0023L','Sphere Femur Cemented Left S3 +','implant','GMK Sphere','LEFT','3+','cemented','KNEE','Femoral Component'),
('02.12.0024L','Sphere Femur Cemented Left S4 +','implant','GMK Sphere','LEFT','4+','cemented','KNEE','Femoral Component'),
('02.12.0025L','Sphere Femur Cemented Left S5 +','implant','GMK Sphere','LEFT','5+','cemented','KNEE','Femoral Component'),
('02.12.0026L','Sphere Femur Cemented Left S6 +','implant','GMK Sphere','LEFT','6+','cemented','KNEE','Femoral Component'),
('02.12.E001RP','GMK-SPHERE resurfacing patella E-Cross – S1','implant','GMK Sphere','NA','1','NA','KNEE','Patella'),
('02.12.E002RP','GMK-SPHERE resurfacing patella E-Cross – S2','implant','GMK Sphere','NA','2','NA','KNEE','Patella'),
('02.12.E003RP','GMK-SPHERE resurfacing patella E-Cross – S3','implant','GMK Sphere','NA','3','NA','KNEE','Patella'),
('02.12.E004RP','GMK-SPHERE resurfacing patella E-Cross – S4','implant','GMK Sphere','NA','4','NA','KNEE','Patella'),
('02.12.T3I4L','GMK-SPHERE Tibial component cemented t3i4L','implant','GMK Sphere','LEFT','T3I4','NA','KNEE','Tibial Insert'),
('02.12.T4I3L','GMK-SPHERE Tibial component cemented t4i3L','implant','GMK Sphere','LEFT','T4I3','NA','KNEE','Tibial Insert')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint,nullif(d.dtype,'') from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint) as (values
('02.12S.505','GMK Sphere Femur S1 to 7L - Ultimate Tibia 1 to 6L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1277','Trial baseplate # Tibia 1 Insert 1L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1279','Trial baseplate # Tibia 2 Insert 2L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1281','Trial baseplate # Tibia 3 Insert 3L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1439','Trial Tibial Tray t4-i3 L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1283','Trial baseplate # Tibia 4 Insert 4L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1285','Trial baseplate # Tibia 5 Insert 5L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1287','Trial baseplate # Tibia 6 Insert 6L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1437','Trial Tibial Tray t3-i4 L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.0003','Trial Femoral Component S2 - LEFT','instrument_tray','GMK Sphere Ultimate','NA','2','NA','KNEE'),
('02.12.10.0005','Trial Femoral Component S3 - LEFT','instrument_tray','GMK Sphere Ultimate','NA','3','NA','KNEE'),
('02.12.10.0301','Trial Femoral Component S1+ - LEFT','instrument_tray','GMK Sphere Ultimate','NA','1+','NA','KNEE'),
('02.12.10.0303','Trial Femoral Component S2+ - LEFT','instrument_tray','GMK Sphere Ultimate','NA','2+','NA','KNEE'),
('02.12.10.0305','Trial Femoral Component S3+ - LEFT','instrument_tray','GMK Sphere Ultimate','NA','3+','NA','KNEE'),
('02.12.10.0007','Trial Femoral Component S4 - LEFT','instrument_tray','GMK Sphere Ultimate','NA','4','NA','KNEE'),
('02.12.10.0009','Trial Femoral Component S5 - LEFT','instrument_tray','GMK Sphere Ultimate','NA','5','NA','KNEE'),
('02.12.10.0011','Trial Femoral Component S6 - LEFT','instrument_tray','GMK Sphere Ultimate','NA','6','NA','KNEE'),
('02.12.10.0013','Trial Femoral Component S7 - LEFT','instrument_tray','GMK Sphere Ultimate','NA','7','NA','KNEE'),
('02.12.10.0307','Trial Femoral Component S4+ - LEFT','instrument_tray','GMK Sphere Ultimate','NA','4+','NA','KNEE'),
('02.12.10.0309','Trial Femoral Component S5+ - LEFT','instrument_tray','GMK Sphere Ultimate','NA','5+','NA','KNEE'),
('02.12.10.0311','Trial Femoral Component S6+ - LEFT','instrument_tray','GMK Sphere Ultimate','NA','6+','NA','KNEE'),
('02.12.10.8505','GMK Sphere Femur S1 to 7L - Ultimate Tibia 1 to 6L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12S.527','GMK Sphere/Spherika Ult Flex E-CROSS Inser trial L','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1726','Ultimate Flex e-cross trial insert S1L - 10mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1727','Ultimate Flex e-cross trial insert S1L- 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1728','Ultimate Flex e-cross trial insert S1L - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1729','Ultimate Flex e-cross trial insert S1L- 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1730','Ultimate Flex e-cross trial insert S1L- 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1731','Ultimate Flex e-cross trial insert S1L- 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1732','Ultimate Flex e-cross trial insert S1L- 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1740','Ultimate Flex e-cross trial insert S2L - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1741','Ultimate Flex e-cross trial insert S2L - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1742','Ultimate Flex e-cross trial insert S2L - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1743','Ultimate Flex e-cross trial insert S2L - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1744','Ultimate Flex e-cross trial insert S2L - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1745','Ultimate Flex e-cross trial insert S2L - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1746','Ultimate Flex e-cross trial insert S2L - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1754','Ultimate Flex e-cross trial insert S3L - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1755','Ultimate Flex e-cross trial insert S3L - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1756','Ultimate Flex e-cross trial insert S3L - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1757','Ultimate Flex e-cross trial insert S3L - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1758','Ultimate Flex e-cross trial insert S3L - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1759','Ultimate Flex e-cross trial insert S3L - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1760','Ultimate Flex e-cross trial insert S3L - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1768','Ultimate Flex e-cross trial insert S4L - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1769','Ultimate Flex e-cross trial insert S4L - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1770','Ultimate Flex e-cross trial insert S4L - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1771','Ultimate Flex e-cross trial insert S4L - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1772','Ultimate Flex e-cross trial insert S4L - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1773','Ultimate Flex e-cross trial insert S4L - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1774','Ultimate Flex e-cross trial insert S4L - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1782','Ultimate Flex e-cross trial insert S5L - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1783','Ultimate Flex e-cross trial insert S5L - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1784','Ultimate Flex e-cross trial insert S5L - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1785','Ultimate Flex e-cross trial insert S5L - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1786','Ultimate Flex e-cross trial insert S5L - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1787','Ultimate Flex e-cross trial insert S5L - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1788','Ultimate Flex e-cross trial insert S5L - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1796','Ultimate Flex e-cross trial insert S6L - 10 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1797','Ultimate Flex e-cross trial insert S6L - 11 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1798','Ultimate Flex e-cross trial insert S6L - 12 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1799','Ultimate Flex e-cross trial insert S6L - 13 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1800','Ultimate Flex e-cross trial insert S6L - 14 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1801','Ultimate Flex e-cross trial insert S6L - 17 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.1802','Ultimate Flex e-cross trial insert S6L - 20 mm','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE'),
('02.12.10.8230','GMK Ultimate Sphere Trial Ins. E-CROSS FLEX L Tray','instrument_tray','GMK Sphere Ultimate','NA','','NA','KNEE')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

update catalog_items set thickness_mm = v.thickness
from (values
('02.12.10.1726',10),
('02.12.10.1727',11),
('02.12.10.1728',12),
('02.12.10.1729',13),
('02.12.10.1730',14),
('02.12.10.1731',17),
('02.12.10.1732',20),
('02.12.10.1740',10),
('02.12.10.1741',11),
('02.12.10.1742',12),
('02.12.10.1743',13),
('02.12.10.1744',14),
('02.12.10.1745',17),
('02.12.10.1746',20),
('02.12.10.1754',10),
('02.12.10.1755',11),
('02.12.10.1756',12),
('02.12.10.1757',13),
('02.12.10.1758',14),
('02.12.10.1759',17),
('02.12.10.1760',20),
('02.12.10.1768',10),
('02.12.10.1769',11),
('02.12.10.1770',12),
('02.12.10.1771',13),
('02.12.10.1772',14),
('02.12.10.1773',17),
('02.12.10.1774',20),
('02.12.10.1782',10),
('02.12.10.1783',11),
('02.12.10.1784',12),
('02.12.10.1785',13),
('02.12.10.1786',14),
('02.12.10.1787',17),
('02.12.10.1788',20),
('02.12.10.1796',10),
('02.12.10.1797',11),
('02.12.10.1798',12),
('02.12.10.1799',13),
('02.12.10.1800',14),
('02.12.10.1801',17),
('02.12.10.1802',20)
) as v(ref,thickness)
where catalog_items.item_number = v.ref and catalog_items.thickness_mm is distinct from v.thickness::int;

insert into tote_templates (territory_id,name,reusable,code,content_type)
select t.id, x.name, x.reusable, x.code, x.content_type from (select id from territories order by created_at limit 1) t
cross join (values
  ('Sphere femur (left) cemented & e-cross patella', false, 'GSFETIL', 'implants'),
  ('INST 500 Sphere Fem/Tib L', true, '500SPTRL', 'instruments')
) as x(name, reusable, code, content_type)
where not exists (select 1 from tote_templates y where y.code = x.code and y.territory_id = t.id);

with tt as (select id,territory_id from tote_templates where code='GSFETIL' order by created_at desc limit 1),
l(ref,qty) as (values
('02.07.1201L',1),
('02.07.1202L',1),
('02.07.1203L',1),
('02.07.1204L',1),
('02.07.1205L',1),
('02.07.1206L',1),
('02.07.F11030',1),
('02.07.F11066',1),
('02.12.0001L',1),
('02.12.0002L',1),
('02.12.0003L',1),
('02.12.0004L',1),
('02.12.0005L',1),
('02.12.0006L',1),
('02.12.0007L',1),
('02.12.0021L',1),
('02.12.0022L',1),
('02.12.0023L',1),
('02.12.0024L',1),
('02.12.0025L',1),
('02.12.0026L',1),
('02.12.E001RP',2),
('02.12.E002RP',2),
('02.12.E003RP',2),
('02.12.E004RP',2),
('02.12.T3I4L',1),
('02.12.T4I3L',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

with tt as (select id,territory_id from tote_templates where code='500SPTRL' order by created_at desc limit 1),
l(ref,qty) as (values
('02.12S.505',1),
('02.12.10.1277',1),
('02.12.10.1279',1),
('02.12.10.1281',1),
('02.12.10.1439',1),
('02.12.10.1283',1),
('02.12.10.1285',1),
('02.12.10.1287',1),
('02.12.10.1437',1),
('02.12.10.0003',1),
('02.12.10.0005',1),
('02.12.10.0301',1),
('02.12.10.0303',1),
('02.12.10.0305',1),
('02.12.10.0007',1),
('02.12.10.0009',1),
('02.12.10.0011',1),
('02.12.10.0013',1),
('02.12.10.0307',1),
('02.12.10.0309',1),
('02.12.10.0311',1),
('02.12.10.8505',1),
('02.12S.527',1),
('02.12.10.1726',1),
('02.12.10.1727',1),
('02.12.10.1728',1),
('02.12.10.1729',1),
('02.12.10.1730',1),
('02.12.10.1731',1),
('02.12.10.1732',1),
('02.12.10.1740',1),
('02.12.10.1741',1),
('02.12.10.1742',1),
('02.12.10.1743',1),
('02.12.10.1744',1),
('02.12.10.1745',1),
('02.12.10.1746',1),
('02.12.10.1754',1),
('02.12.10.1755',1),
('02.12.10.1756',1),
('02.12.10.1757',1),
('02.12.10.1758',1),
('02.12.10.1759',1),
('02.12.10.1760',1),
('02.12.10.1768',1),
('02.12.10.1769',1),
('02.12.10.1770',1),
('02.12.10.1771',1),
('02.12.10.1772',1),
('02.12.10.1773',1),
('02.12.10.1774',1),
('02.12.10.1782',1),
('02.12.10.1783',1),
('02.12.10.1784',1),
('02.12.10.1785',1),
('02.12.10.1786',1),
('02.12.10.1787',1),
('02.12.10.1788',1),
('02.12.10.1796',1),
('02.12.10.1797',1),
('02.12.10.1798',1),
('02.12.10.1799',1),
('02.12.10.1800',1),
('02.12.10.1801',1),
('02.12.10.1802',1),
('02.12.10.8230',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

insert into case_templates (territory_id,name,surgery_type,variant,code)
select t.id,'500 Sphere KA Left Case','KNEE','total','500 Sphere KA Left Case'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from case_templates x where x.code='500 Sphere KA Left Case' and x.territory_id=t.id);

with ct as (select id,territory_id from case_templates where code='500 Sphere KA Left Case' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('GSFETIL','GSTILVE','PATRES','500METAL','500SPTRL','6-1BLKS')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);
