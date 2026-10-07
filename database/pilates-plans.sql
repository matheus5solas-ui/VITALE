
alter table public.students add column pilates_plan text check (pilates_plan in ('monthly_1','monthly_2','monthly_3','test_2'));
alter table public.students add column test_plan_started_at timestamptz;
create or replace function vitale_private.set_test_plan_start() returns trigger language plpgsql set search_path='' as $$
begin
 if new.pilates_plan='test_2' and (tg_op='INSERT' or old.pilates_plan is distinct from new.pilates_plan) then new.test_plan_started_at=now();
 else new.test_plan_started_at=case when tg_op='UPDATE' then old.test_plan_started_at else null end;end if;
 return new;
end $$;
create trigger student_test_plan_start before insert or update on public.students for each row execute function vitale_private.set_test_plan_start();
create or replace function public.record_face_event(p_serial text,p_log_id bigint,p_user_id bigint,p_occurred_at timestamptz) returns jsonb language plpgsql set search_path='' as $$
declare d uuid;s uuid;e uuid;a uuid;p uuid;plan text;plan_start timestamptz;
begin
 select id into d from public.devices where serial=p_serial and active;
 if d is null then raise exception 'unknown device';end if;
 select student_id into s from public.face_bindings where device_id=d and user_id=p_user_id;
 if s is null then raise exception 'unknown facial user';end if;
 select pilates_plan,test_plan_started_at into plan,plan_start from public.students where id=s and active for update;
 if not found then raise exception 'inactive student';end if;
 insert into public.face_events(device_id,log_id,user_id,occurred_at) values(d,p_log_id,p_user_id,p_occurred_at) on conflict(device_id,log_id) do nothing returning id into e;
 if e is null then return jsonb_build_object('duplicate',true);end if;
 select id into a from public.appointments where student_id=s and status in ('scheduled','present','completed')
 and p_occurred_at>=starts_at-interval '15 minutes' and p_occurred_at<ends_at
 order by (starts_at<=p_occurred_at) desc, case when starts_at<=p_occurred_at then starts_at end desc,starts_at asc limit 1 for update;
 if a is not null and exists(select 1 from public.attendance where appointment_id=a) then return jsonb_build_object('duplicate',true,'event_id',e);end if;
 if plan='test_2' then
  if a is null then return jsonb_build_object('blocked',true,'reason','outside_appointment','event_id',e);end if;
  if p_occurred_at<plan_start or (select count(*) from public.attendance where student_id=s and appointment_id is not null and occurred_at>=plan_start)>=2 then
   return jsonb_build_object('blocked',true,'reason','plan_exhausted','event_id',e);end if;
 end if;
 if a is null and exists(select 1 from public.attendance where student_id=s and occurred_at between p_occurred_at-interval '5 minutes' and p_occurred_at+interval '5 minutes') then return jsonb_build_object('duplicate',true,'event_id',e);end if;
 insert into public.attendance(student_id,appointment_id,face_event_id,occurred_at,source) values(s,a,e,p_occurred_at,'facial') returning id into p;
 if a is not null then update public.appointments set status='present' where id=a;end if;
 return jsonb_build_object('attendance_id',p,'requires_review',a is null);
end $$;
update public.face_bindings set student_id='bf2cf18e-1fcb-4608-8f6c-d83c139257fa' where device_id='7fbed236-9742-4412-96c8-61ff9c169f34' and user_id=1 and student_id='fb31541c-112e-449a-870c-fc0457269e06';
insert into public.appointments(student_id,professional_id,starts_at,ends_at,activity)
values ('bf2cf18e-1fcb-4608-8f6c-d83c139257fa','54705581-3695-43f4-b5b8-b492ba2a977e','2026-10-07 20:00:00-03','2026-10-07 21:00:00-03','Pilates'),
('bf2cf18e-1fcb-4608-8f6c-d83c139257fa','54705581-3695-43f4-b5b8-b492ba2a977e','2026-10-07 21:00:00-03','2026-10-07 22:00:00-03','Pilates') on conflict(student_id,starts_at) do nothing;
