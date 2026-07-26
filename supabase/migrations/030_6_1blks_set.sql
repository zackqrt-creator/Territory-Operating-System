-- 6-1BLKS: INST SPHERE ALLINONE BLKS -- final Set for the
-- '500 GMK SpheriKA Right' procedure (all 6 Sets now complete).
with t as (select id from territories order by created_at limit 1),
d(ref,name,cat,pl,side,size,cement,joint) as (values
('02.12S.413','GMK Sphere All-In One finishing inst set','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE'),
('02.12.10.0959','6in1 cutting block size 1','instrument_tray','GMK Sphere All-In-One','NA','1','NA','KNEE'),
('02.12.10.0960','6in1 cutting block size 1+','instrument_tray','GMK Sphere All-In-One','NA','1+','NA','KNEE'),
('02.12.10.0961','6in1 cutting block size 2','instrument_tray','GMK Sphere All-In-One','NA','2','NA','KNEE'),
('02.12.10.0962','6in1 cutting block size 2+','instrument_tray','GMK Sphere All-In-One','NA','2+','NA','KNEE'),
('02.12.10.0963','6in1 cutting block size 3','instrument_tray','GMK Sphere All-In-One','NA','3','NA','KNEE'),
('02.12.10.0964','6in1 cutting block size 3+','instrument_tray','GMK Sphere All-In-One','NA','3+','NA','KNEE'),
('02.12.10.0965','6in1 cutting block size 4','instrument_tray','GMK Sphere All-In-One','NA','4','NA','KNEE'),
('02.12.10.0966','6in1 cutting block size 4+','instrument_tray','GMK Sphere All-In-One','NA','4+','NA','KNEE'),
('02.12.10.0967','6in1 cutting block size 5','instrument_tray','GMK Sphere All-In-One','NA','5','NA','KNEE'),
('02.12.10.0968','6in1 cutting block size 5+','instrument_tray','GMK Sphere All-In-One','NA','5+','NA','KNEE'),
('02.12.10.0969','6in1 cutting block size 6','instrument_tray','GMK Sphere All-In-One','NA','6','NA','KNEE'),
('02.12.10.0970','6in1 cutting block size 6+','instrument_tray','GMK Sphere All-In-One','NA','6+','NA','KNEE'),
('02.12.10.0971','6in1 cutting block size 7','instrument_tray','GMK Sphere All-In-One','NA','7','NA','KNEE'),
('02.12.10.0972','6in1 cancellous screw L30 D.7','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE'),
('02.12.10.0973','6in1 repositioning block anterior ref +1','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE'),
('02.12.10.0974','6in1 repositioning block anterior ref +2','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE'),
('02.12.10.0975','6in1 repositioning block posterior ref +1','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE'),
('02.12.10.0976','6in1 repositioning block posterior ref +2','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE'),
('75.18.847','Inopack small cm.8x4.5x2 - pin box for inst. trays','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE'),
('02.12.10.8553','GMK Sphere All-In One finishing inst set','instrument_tray','GMK Sphere All-In-One','NA','','NA','KNEE')
)
insert into catalog_items (territory_id,item_number,name,category,product_line,side,size_label,cement_type,joint)
select t.id,d.ref,d.name,d.cat,d.pl,d.side,nullif(d.size,''),d.cement,d.joint from d cross join t
where not exists (select 1 from catalog_items c where c.territory_id=t.id and c.item_number=d.ref);

with tt as (select id,territory_id from tote_templates where code='6-1BLKS' order by created_at desc limit 1),
l(ref,qty) as (values
('02.12S.413',1),
('02.12.10.0959',1),
('02.12.10.0960',1),
('02.12.10.0961',1),
('02.12.10.0962',1),
('02.12.10.0963',1),
('02.12.10.0964',1),
('02.12.10.0965',1),
('02.12.10.0966',1),
('02.12.10.0967',1),
('02.12.10.0968',1),
('02.12.10.0969',1),
('02.12.10.0970',1),
('02.12.10.0971',1),
('02.12.10.0972',3),
('02.12.10.0973',1),
('02.12.10.0974',1),
('02.12.10.0975',1),
('02.12.10.0976',1),
('75.18.847',1),
('02.12.10.8553',1)
)
insert into tote_template_items (tote_template_id,catalog_item_id,quantity_per_tote)
select tt.id,c.id,l.qty from l join tt on true
join catalog_items c on c.territory_id=tt.territory_id and c.item_number=l.ref
where not exists (select 1 from tote_template_items ti where ti.tote_template_id=tt.id and ti.catalog_item_id=c.id);
