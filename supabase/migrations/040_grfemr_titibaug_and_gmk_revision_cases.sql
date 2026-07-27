-- Completes the GMK Revision system: GRFEMR (right mirror of GRFEML) and
-- TITIBAUG (screwed tibial augments, shared both sides). GEXT/GINSERT/TIAUG/
-- REVT already loaded and are ambidextrous, reused as-is. This finishes both
-- procedures: GMK Revision Left and GMK Revision Right.

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.07.0681R','Rev. Tibial Tray Right S1','implant','GMK Revision','RIGHT','1','NA','KNEE','Tibial Tray'),
('02.07.0682R','Rev. Tibial Tray Right S2','implant','GMK Revision','RIGHT','2','NA','KNEE','Tibial Tray'),
('02.07.0683R','Rev. Tibial Tray Right S3','implant','GMK Revision','RIGHT','3','NA','KNEE','Tibial Tray'),
('02.07.0684R','Rev. Tibial Tray Right S4','implant','GMK Revision','RIGHT','4','NA','KNEE','Tibial Tray'),
('02.07.0685R','Rev. Tibial Tray Right S5','implant','GMK Revision','RIGHT','5','NA','KNEE','Tibial Tray'),
('02.07.0686R','Rev. Tibial Tray Right S6','implant','GMK Revision','RIGHT','6','NA','KNEE','Tibial Tray'),
('02.07.2401R','Rev. Femur P.S. Cemented Right S1','implant','GMK Revision','RIGHT','1','cemented','KNEE','Femoral Component'),
('02.07.2402R','Rev. Femur P.S. Cemented Right S2','implant','GMK Revision','RIGHT','2','cemented','KNEE','Femoral Component'),
('02.07.2403R','Rev. Femur P.S. Cemented Right S3','implant','GMK Revision','RIGHT','3','cemented','KNEE','Femoral Component'),
('02.07.2404R','Rev. Femur P.S. Cemented Right S4','implant','GMK Revision','RIGHT','4','cemented','KNEE','Femoral Component'),
('02.07.2405R','Rev. Femur P.S. Cemented Right S5','implant','GMK Revision','RIGHT','5','cemented','KNEE','Femoral Component'),
('02.07.2406R','Rev. Femur P.S. Cemented Right S6','implant','GMK Revision','RIGHT','6','cemented','KNEE','Femoral Component')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint,nullif(d.dtype,'') from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint,dtype) as (values
('02.09.8TA005','Screwed Tibial Augment #0/5mm-TiAlV','implant','GMK Revision','NA','0/5mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA010','Screwed Tibial Augment #0/10mm-TiAlV','implant','GMK Revision','NA','0/10mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA105','Screwed Tibial Augment #1/5mm-TiAlV','implant','GMK Revision','NA','1/5mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA110','Screwed Tibial Augment #1/10mm-TiAlV','implant','GMK Revision','NA','1/10mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA205','Screwed Tibial Augment #2/5mm-TiAlV','implant','GMK Revision','NA','2/5mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA210','Screwed Tibial Augment #2/10mm-TiAlV','implant','GMK Revision','NA','2/10mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA305','Screwed Tibial Augment #3/5mm-TiAlV','implant','GMK Revision','NA','3/5mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA310','Screwed Tibial Augment #3/10mm-TiAlV','implant','GMK Revision','NA','3/10mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA405','Screwed Tibial Augment #4/5mm-TiAlV','implant','GMK Revision','NA','4/5mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA410','Screwed Tibial Augment #4/10mm-TiAlV','implant','GMK Revision','NA','4/10mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA505','Screwed Tibial Augment #5/5mm-TiAlV','implant','GMK Revision','NA','5/5mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA510','Screwed Tibial Augment #5/10mm-TiAlV','implant','GMK Revision','NA','5/10mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA605','Screwed Tibial Augment #6/5mm-TiAlV','implant','GMK Revision','NA','6/5mm','cementless','KNEE','Tibial Augment'),
('02.09.8TA610','Screwed Tibial Augment #6/10mm-TiAlV','implant','GMK Revision','NA','6/10mm','cementless','KNEE','Tibial Augment')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint,device_type)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint,nullif(d.dtype,'') from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

update catalog_items set thickness_mm = v.thickness
from (values
('02.09.8TA005',5),
('02.09.8TA010',10),
('02.09.8TA105',5),
('02.09.8TA110',10),
('02.09.8TA205',5),
('02.09.8TA210',10),
('02.09.8TA305',5),
('02.09.8TA310',10),
('02.09.8TA405',5),
('02.09.8TA410',10),
('02.09.8TA505',5),
('02.09.8TA510',10),
('02.09.8TA605',5),
('02.09.8TA610',10)
) as v(ref,thickness)
where catalog_items.item_number = v.ref and catalog_items.thickness_mm is distinct from v.thickness::int;

insert into tote_templates (territory_id,name,reusable,code,content_type)
select t.id, x.name, x.reusable, x.code, x.content_type from (select id from territories order by created_at limit 1) t
cross join (values
  ('GMK Revision femur/tibial trays (right) & patella', false, 'GRFEMR', 'implants'),
  ('GMK Revision TiAlV screwed tibial augments', false, 'TITIBAUG', 'implants')
) as x(name, reusable, code, content_type)
where not exists (select 1 from tote_templates y where y.code = x.code and y.territory_id = t.id);

with tt as (select id,territory_id from tote_templates where code='GRFEMR' order by created_at desc limit 1),
l(ref,qty) as (values
('02.07.0033RP',2),
('02.07.0034RP',2),
('02.07.0035RP',2),
('02.07.0036RP',2),
('02.07.0681R',1),
('02.07.0682R',1),
('02.07.0683R',1),
('02.07.0684R',1),
('02.07.0685R',1),
('02.07.0686R',1),
('02.07.2401R',1),
('02.07.2402R',1),
('02.07.2403R',1),
('02.07.2404R',1),
('02.07.2405R',1),
('02.07.2406R',1),
('02.07.CXS20',1),
('02.07.FSC11065',2)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

with tt as (select id,territory_id from tote_templates where code='TITIBAUG' order by created_at desc limit 1),
l(ref,qty) as (values
('02.09.8TA005',2),
('02.09.8TA010',2),
('02.09.8TA105',2),
('02.09.8TA110',2),
('02.09.8TA205',2),
('02.09.8TA210',2),
('02.09.8TA305',2),
('02.09.8TA310',2),
('02.09.8TA405',2),
('02.09.8TA410',2),
('02.09.8TA505',2),
('02.09.8TA510',2),
('02.09.8TA605',2),
('02.09.8TA610',2)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);

insert into case_templates (territory_id,name,surgery_type,variant,code)
select t.id, x.name, 'KNEE', 'total', x.name
from (select id from territories order by created_at limit 1) t
cross join (values ('GMK Revision Left'), ('GMK Revision Right')) as x(name)
where not exists (select 1 from case_templates ct where ct.code=x.name and ct.territory_id=t.id);

with ct as (select id,territory_id from case_templates where code='GMK Revision Left' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('GRFEML','GEXT','GINSERT','TIAUG','REVT','TITIBAUG')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);

with ct as (select id,territory_id from case_templates where code='GMK Revision Right' order by created_at desc limit 1)
insert into procedure_sets (territory_id,case_template_id,tote_template_id)
select ct.territory_id, ct.id, tt.id
from ct join tote_templates tt on tt.territory_id = ct.territory_id
  and tt.code in ('GRFEMR','GEXT','GINSERT','TIAUG','REVT','TITIBAUG')
where not exists (select 1 from procedure_sets ps where ps.case_template_id=ct.id and ps.tote_template_id=tt.id);
