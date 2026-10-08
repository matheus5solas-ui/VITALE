create or replace function public.record_face_event(p_serial text,p_log_id bigint,p_user_id bigint,p_occurred_at timestamptz) returns jsonb language plpgsql set search_path='' as $$
declare d uuid;s uuid;e uuid;a uuid;p uuid;plan text;plan_start timestamptz;last_presence timestamptz;
begin
 select id into d from public.devices where serial=p_serial and active;
 if d is null then raise exception 'unknown device';end if;
 select student_id into s from public.face_bindings where device_id=d and user_id=p_user_id;
 if s is null then raise exception 'unknown facial user';end if;
 select pilates_plan,test_plan_started_at into plan,plan_start from public.students where id=s and active for update;
 if not found then raise exception 'inactive student';end if;
 insert into public.face_events(device_id,log_id,user_id,occurred_at) values(d,p_log_id,p_user_id,p_occurred_at) on conflict(device_id,log_id) do nothing returning id into e;
 if e is null then return jsonb_build_object('duplicate',true);end if;
 if plan='test_2' then
  if p_occurred_at<plan_start then return jsonb_build_object('blocked',true,'reason','previous_cycle','event_id',e);end if;
  if (select count(*) from public.attendance where student_id=s and occurred_at>=plan_start)>=2 then
   return jsonb_build_object('blocked',true,'reason','plan_exhausted','event_id',e);end if;
  select max(occurred_at) into last_presence from public.attendance where student_id=s and occurred_at>=plan_start;
  if last_presence is not null and p_occurred_at<last_presence+interval '30 minutes' then
   return jsonb_build_object('duplicate',true,'reason','same_class','event_id',e);end if;
  select ap.id into a from public.appointments ap where ap.student_id=s and ap.activity='Pilates' and ap.status='scheduled'
   and (ap.starts_at at time zone 'America/Fortaleza')::date=(p_occurred_at at time zone 'America/Fortaleza')::date
   and not exists(select 1 from public.attendance t where t.appointment_id=ap.id)
   order by abs(extract(epoch from ap.starts_at-p_occurred_at)),ap.starts_at limit 1 for update;
 else
  select id into a from public.appointments where student_id=s and status in ('scheduled','present','completed')
  and p_occurred_at>=starts_at-interval '15 minutes' and p_occurred_at<ends_at
  order by (starts_at<=p_occurred_at) desc, case when starts_at<=p_occurred_at then starts_at end desc,starts_at asc limit 1 for update;
  if a is not null and exists(select 1 from public.attendance where appointment_id=a) then return jsonb_build_object('duplicate',true,'event_id',e);end if;
 end if;
 if plan is distinct from 'test_2' and a is null and exists(select 1 from public.attendance where student_id=s and occurred_at between p_occurred_at-interval '5 minutes' and p_occurred_at+interval '5 minutes') then return jsonb_build_object('duplicate',true,'event_id',e);end if;
 insert into public.attendance(student_id,appointment_id,face_event_id,occurred_at,source) values(s,a,e,p_occurred_at,'facial') returning id into p;
 if a is not null then update public.appointments set status='present' where id=a;end if;
 return jsonb_build_object('attendance_id',p,'requires_review',a is null);
end $$;

create or replace function public.facial_access_state(p_serial text) returns jsonb language sql set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('user_id',b.user_id::text,'managed',coalesce(s.pilates_plan='test_2',false),'remaining',greatest(0,2-coalesce(u.used,0)),'blocked',coalesce(s.pilates_plan='test_2',false) and coalesce(u.used,0)>=2,'allow_until',u.last_presence)), '[]'::jsonb)
 from public.face_bindings b join public.devices d on d.id=b.device_id join public.students s on s.id=b.student_id
 left join lateral (select count(*)::int as used,max(t.occurred_at) as last_presence from public.attendance t where t.student_id=s.id and t.occurred_at>=s.test_plan_started_at) u on true
 where d.serial=p_serial and d.active and s.active;
$$;
