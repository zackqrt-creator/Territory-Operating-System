-- GSTILVE (Left tibial inserts) + 500KATRL (Left femoral/tibial trial
-- instrument tray) + the '500 GMK SpheriKA Left' Procedure -> 6 Sets
-- mapping (reusing PATRES/500METAL/6-1BLKS, which are ambidextrous).

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.12.E0210FL','GMK-SPHERE tibial insert E-Cross - Flex 2L - 10mm','implant','GMK Sphere','LEFT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0211FL','GMK-SPHERE tibial insert E-Cross - Flex 2L - 11mm','implant','GMK Sphere','LEFT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0212FL','GMK-SPHERE tibial insert E-Cross - Flex 2L - 12mm','implant','GMK Sphere','LEFT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0213FL','GMK-SPHERE tibial insert E-Cross - Flex 2L - 13mm','implant','GMK Sphere','LEFT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0214FL','GMK-SPHERE tibial insert E-Cross - Flex 2L - 14mm','implant','GMK Sphere','LEFT','Flex 2','NA','KNEE','Tibial Insert'),
('02.12.E0310FL','GMK-SPHERE tibial insert E-Cross - Flex 3L - 10mm','implant','GMK Sphere','LEFT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0311FL','GMK-SPHERE tibial insert E-Cross - Flex 3L - 11mm','implant','GMK Sphere','LEFT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0312FL','GMK-SPHERE tibial insert E-Cross - Flex 3L - 12mm','implant','GMK Sphere','LEFT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0313FL','GMK-SPHERE tibial insert E-Cross - Flex 3L - 13mm','implant','GMK Sphere','LEFT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0314FL','GMK-SPHERE tibial insert E-Cross - Flex 3L - 14mm','implant','GMK Sphere','LEFT','Flex 3','NA','KNEE','Tibial Insert'),
('02.12.E0410FL','GMK-SPHERE tibial insert E-Cross - Flex 4L - 10mm','implant','GMK Sphere','LEFT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0411FL','GMK-SPHERE tibial insert E-Cross - Flex 4L - 11mm','implant','GMK Sphere','LEFT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0412FL','GMK-SPHERE tibial insert E-Cross - Flex 4L - 12mm','implant','GMK Sphere','LEFT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0413FL','GMK-SPHERE tibial insert E-Cross - Flex 4L - 13mm','implant','GMK Sphere','LEFT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0414FL','GMK-SPHERE tibial insert E-Cross - Flex 4L - 14mm','implant','GMK Sphere','LEFT','Flex 4','NA','KNEE','Tibial Insert'),
('02.12.E0510FL','GMK-SPHERE tibial insert E-Cross - Flex 5L - 10mm','implant','GMK Sphere','LEFT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0511FL','GMK-SPHERE tibial insert E-Cross - Flex 5L - 11mm','implant','GMK Sphere','LEFT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0512FL','GMK-SPHERE tibial insert E-Cross - Flex 5L - 12mm','implant','GMK Sphere','LEFT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0513FL','GMK-SPHERE tibial insert E-Cross - Flex 5L - 13mm','implant','GMK Sphere','LEFT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0514FL','GMK-SPHERE tibial insert E-Cross - Flex 5L - 14mm','implant','GMK Sphere','LEFT','Flex 5','NA','KNEE','Tibial Insert'),
('02.12.E0610FL','GMK-SPHERE tibial insert E-Cross - Flex 6L - 10mm','implant','GMK Sphere','LEFT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0611FL','GMK-SPHERE tibial insert E-Cross - Flex 6L - 11mm','implant','GMK Sphere','LEFT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0612FL','GMK-SPHERE tibial insert E-Cross - Flex 6L - 12mm','implant','GMK Sphere','LEFT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0613FL','GMK-SPHERE tibial insert E-Cross - Flex 6L - 13mm','implant','GMK Sphere','LEFT','Flex 6','NA','KNEE','Tibial Insert'),
('02.12.E0614FL','GMK-SPHERE tibial insert E-Cross - Flex 6L - 14mm','implant','GMK Sphere','LEFT','Flex 6','NA','KNEE','Tibial Insert')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,d.size,d.cement,d.joint,d.dtype from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

update catalog_items set thickness_mm = v.thickness
from (values
('02.12.E0210FL',10),
('02.12.E0211FL',11),
('02.12.E0212FL',12),
('02.12.E0213FL',13),
('02.12.E0214FL',14),
('02.12.E0310FL',10),
('02.12.E0311FL',11),
('02.12.E0312FL',12),
('02.12.E0313FL',13),
('02.12.E0314FL',14),
('02.12.E0410FL',10),
('02.12.E0411FL',11),
('02.12.E0412FL',12),
('02.12.E0413FL',13),
('02.12.E0414FL',14),
('02.12.E0510FL',10),
('02.12.E0511FL',11),
('02.12.E0512FL',12),
('02.12.E0513FL',13),
('02.12.E0514FL',14),
('02.12.E0610FL',10),
('02.12.E0611FL',11),
('02.12.E0612FL',12),
('02.12.E0613FL',13),
('02.12.E0614FL',14)
) as v(ref,thickness)
where catalog_items.item_number = v.ref and catalog_items.thickness_mm is distinct from v.thickness;

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint) as (values
('02.12S.515','GMK Spherika Ultimate Femur S1 to 7L- Tibia to 6L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1448','GMK Spherika Trial Femoral Component #1+L','instrument_tray','GMK Spherika Ultimate','NA','1+','NA','KNEE'),
('02.12.10.1450','GMK Spherika Trial Femoral Component #2L','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1452','GMK Spherika Trial Femoral Component #2+L','instrument_tray','GMK Spherika Ultimate','NA','2+','NA','KNEE'),
('02.12.10.1454','GMK Spherika Trial Femoral Component #3L','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1456','GMK Spherika Trial Femoral Component #3+L','instrument_tray','GMK Spherika Ultimate','NA','3+','NA','KNEE'),
('02.12.10.1458','GMK Spherika Trial Femoral Component #4L','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1460','GMK Spherika Trial Femoral Component #4+L','instrument_tray','GMK Spherika Ultimate','NA','4+','NA','KNEE'),
('02.12.10.1462','GMK Spherika Trial Femoral Component #5L','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1464','GMK Spherika Trial Femoral Component #5+L','instrument_tray','GMK Spherika Ultimate','NA','5+','NA','KNEE'),
('02.12.10.1466','GMK Spherika Trial Femoral Component #6L','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.1468','GMK Spherika Trial Femoral Component #6+L','instrument_tray','GMK Spherika Ultimate','NA','6+','NA','KNEE'),
('02.12.10.1470','GMK Spherika Trial Femoral Component #7L','instrument_tray','GMK Spherika Ultimate','NA','7','NA','KNEE'),
('02.12.10.1277','Trial baseplate # Tibia 1 Insert 1L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1279','Trial baseplate # Tibia 2 Insert 2L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1281','Trial baseplate # Tibia 3 Insert 3L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1439','Trial Tibial Tray t4-i3 L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1283','Trial baseplate # Tibia 4 Insert 4L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1285','Trial baseplate # Tibia 5 Insert 5L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1287','Trial baseplate # Tibia 6 Insert 6L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1437','Trial Tibial Tray t3-i4 L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.8555','GMK Spherika Ultimate Femur S1 to 7L- Tibia to 6L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12S.527','GMK Sphere/Spherika Ult Flex E-CROSS Inser trial L','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE'),
('02.12.10.1726','Ultimate Flex e-cross trial insert S1L - 10mm','instrument_tray','GMK Spherika Ultimate','NA','1','NA','KNEE'),
('02.12.10.1727','Ultimate Flex e-cross trial insert S1L- 11 mm','instrument_tray','GMK Spherika Ultimate','NA','1','NA','KNEE'),
('02.12.10.1728','Ultimate Flex e-cross trial insert S1L - 12 mm','instrument_tray','GMK Spherika Ultimate','NA','1','NA','KNEE'),
('02.12.10.1729','Ultimate Flex e-cross trial insert S1L- 13 mm','instrument_tray','GMK Spherika Ultimate','NA','1','NA','KNEE'),
('02.12.10.1730','Ultimate Flex e-cross trial insert S1L- 14 mm','instrument_tray','GMK Spherika Ultimate','NA','1','NA','KNEE'),
('02.12.10.1731','Ultimate Flex e-cross trial insert S1L- 17 mm','instrument_tray','GMK Spherika Ultimate','NA','1','NA','KNEE'),
('02.12.10.1732','Ultimate Flex e-cross trial insert S1L- 20 mm','instrument_tray','GMK Spherika Ultimate','NA','1','NA','KNEE'),
('02.12.10.1740','Ultimate Flex e-cross trial insert S2L - 10 mm','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1741','Ultimate Flex e-cross trial insert S2L - 11 mm','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1742','Ultimate Flex e-cross trial insert S2L - 12 mm','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1743','Ultimate Flex e-cross trial insert S2L - 13 mm','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1744','Ultimate Flex e-cross trial insert S2L - 14 mm','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1745','Ultimate Flex e-cross trial insert S2L - 17 mm','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1746','Ultimate Flex e-cross trial insert S2L - 20 mm','instrument_tray','GMK Spherika Ultimate','NA','2','NA','KNEE'),
('02.12.10.1754','Ultimate Flex e-cross trial insert S3L - 10 mm','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1755','Ultimate Flex e-cross trial insert S3L - 11 mm','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1756','Ultimate Flex e-cross trial insert S3L - 12 mm','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1757','Ultimate Flex e-cross trial insert S3L - 13 mm','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1758','Ultimate Flex e-cross trial insert S3L - 14 mm','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1759','Ultimate Flex e-cross trial insert S3L - 17 mm','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1760','Ultimate Flex e-cross trial insert S3L - 20 mm','instrument_tray','GMK Spherika Ultimate','NA','3','NA','KNEE'),
('02.12.10.1768','Ultimate Flex e-cross trial insert S4L - 10 mm','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1769','Ultimate Flex e-cross trial insert S4L - 11 mm','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1770','Ultimate Flex e-cross trial insert S4L - 12 mm','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1771','Ultimate Flex e-cross trial insert S4L - 13 mm','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1772','Ultimate Flex e-cross trial insert S4L - 14 mm','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1773','Ultimate Flex e-cross trial insert S4L - 17 mm','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1774','Ultimate Flex e-cross trial insert S4L - 20 mm','instrument_tray','GMK Spherika Ultimate','NA','4','NA','KNEE'),
('02.12.10.1782','Ultimate Flex e-cross trial insert S5L - 10 mm','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1783','Ultimate Flex e-cross trial insert S5L - 11 mm','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1784','Ultimate Flex e-cross trial insert S5L - 12 mm','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1785','Ultimate Flex e-cross trial insert S5L - 13 mm','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1786','Ultimate Flex e-cross trial insert S5L - 14 mm','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1787','Ultimate Flex e-cross trial insert S5L - 17 mm','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1788','Ultimate Flex e-cross trial insert S5L - 20 mm','instrument_tray','GMK Spherika Ultimate','NA','5','NA','KNEE'),
('02.12.10.1796','Ultimate Flex e-cross trial insert S6L - 10 mm','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.1797','Ultimate Flex e-cross trial insert S6L - 11 mm','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.1798','Ultimate Flex e-cross trial insert S6L - 12 mm','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.1799','Ultimate Flex e-cross trial insert S6L - 13 mm','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.1800','Ultimate Flex e-cross trial insert S6L - 14 mm','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.1801','Ultimate Flex e-cross trial insert S6L - 17 mm','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.1802','Ultimate Flex e-cross trial insert S6L - 20 mm','instrument_tray','GMK Spherika Ultimate','NA','6','NA','KNEE'),
('02.12.10.8230','GMK Ultimate Sphere Trial Ins. E-CROSS FLEX L Tray','instrument_tray','GMK Spherika Ultimate','NA','','NA','KNEE')
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
  ('SPH Vit-E Tib Inserts Left (Sz 2-6 10mm-14mm)-1', false, 'GSTILVE', 'implants'),
  ('INST 500 Spherika Fem/Tib L', true, '500KATRL', 'instruments')
) as x(name, reusable, code, content_type)
where not exists (select 1 from tote_templates y where y.code = x.code and y.territory_id = t.id);

with tt as (select id,territory_id from tote_templates where code='GSTILVE' order by created_at desc limit 1),
l(ref,qty) as (values
('02.12.E0210FL',1),
('02.12.E0211FL',1),
('02.12.E0212FL',1),
('02.12.E0213FL',1),
('02.12.E0214FL',1),
('02.12.E0310FL',1),
('02.12.E0311FL',1),
('02.12.E0312FL',1),
('02.12.E0313FL',1),
('02.12.E0314FL',1),
('02.12.E0410FL',1),
('02.12.E0411FL',1),
('02.12.E0412FL',1),
('02.12.E0413FL',1),
('02.12.E0414FL',1),
('02.12.E0510FL',1),
('02.12.E0511FL',1),
('02.12.E0512FL',1),
('02.12.E0513FL',1),
('02.12.E0514FL',1),
('02.12.E0610FL',1),
('02.12.E0611FL',1),
('02.12.E0612FL',1),
('02.12.E0613FL',1),
('02.12.E0614FL',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

with tt as (select id,territory_id from tote_templates where code='500KATRL' order by created_at desc limit 1),
l(ref,qty) as (values
('02.12S.515',1),
('02.12.10.1448',1),
('02.12.10.1450',1),
('02.12.10.1452',1),
('02.12.10.1454',1),
('02.12.10.1456',1),
('02.12.10.1458',1),
('02.12.10.1460',1),
('02.12.10.1462',1),
('02.12.10.1464',1),
('02.12.10.1466',1),
('02.12.10.1468',1),
('02.12.10.1470',1),
('02.12.10.1277',1),
('02.12.10.1279',1),
('02.12.10.1281',1),
('02.12.10.1439',1),
('02.12.10.1283',1),
('02.12.10.1285',1),
('02.12.10.1287',1),
('02.12.10.1437',1),
('02.12.10.8555',1),
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
select t.id,'500 GMK SpheriKA Left','KNEE','total','500 GMK SpheriKA Left'
from (select id from territories order by created_at limit 1) t
where not exists (select 1 from case_templates x where x.code='500 GMK SpheriKA Left' and x.territory_id=t.id);

with ct as (select id,territory_id from case_templates where code='500 GMK SpheriKA Left' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('GSKAIMPL','GSTILVE','PATRES','500METAL','500KATRL','6-1BLKS')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);
