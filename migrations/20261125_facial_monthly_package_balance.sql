create function public.vitale_facial_package_balance(
 p_student uuid, p_plan text, p_start date, p_end date, p_test_start timestamptz
) returns table (lesson_limit integer, used integer, last_presence timestamptz)
language sql stable set search_path = ''
as $$
 select case p_plan when 'monthly_1' then 4 when 'monthly_2' then 8
          when 'monthly_3' then 12 when 'test_2' then 2 else 0 end,
        case when p_plan='test_2' then count(*)::int
             else count(distinct (a.occurred_at at time zone 'America/Fortaleza')::date)::int end,
        max(a.occurred_at)
 from public.attendance a
 where a.student_id=p_student
   and not exists (select 1 from public.attendance_voids v where v.attendance_id=a.id)
   and ((p_plan='test_2' and a.occurred_at>=p_test_start)
     or (p_plan in ('monthly_1','monthly_2','monthly_3')
       and (a.occurred_at at time zone 'America/Fortaleza')::date between p_start and coalesce(p_end,p_start+29)));
$$;

revoke all on function public.vitale_facial_package_balance(uuid,text,date,date,timestamptz) from public, anon, authenticated;
grant execute on function public.vitale_facial_package_balance(uuid,text,date,date,timestamptz) to service_role;

CREATE OR REPLACE FUNCTION public.facial_access_state(p_serial text)
RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'user_id',b.user_id::text,
   'managed',balance.lesson_limit>0,
   'remaining',greatest(0,balance.lesson_limit-balance.used),
   'blocked',balance.lesson_limit>0 and balance.used>=balance.lesson_limit,
   'allow_until',balance.last_presence
 )), '[]'::jsonb)
 from public.face_bindings b
 join public.devices d on d.id=b.device_id
 join public.students s on s.id=b.student_id
 cross join lateral public.vitale_facial_package_balance(
  s.id,s.pilates_plan,s.plan_started_on,s.plan_expires_on,s.test_plan_started_at
 ) balance
 where d.serial=p_serial and d.active and s.active;
$$;

CREATE OR REPLACE FUNCTION public.record_face_event(p_serial text, p_log_id bigint, p_user_id bigint, p_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d uuid;s uuid;e uuid;a uuid;p uuid;plan text;plan_start timestamptz;last_presence timestamptz;monthly_start date;monthly_end date;balance record;
begin
 select id into d from public.devices where serial=p_serial and active;
 if d is null then raise exception 'unknown device';end if;
 select student_id into s from public.face_bindings where device_id=d and user_id=p_user_id;
 if s is null then raise exception 'unknown facial user';end if;
 select pilates_plan,test_plan_started_at,plan_started_on,plan_expires_on into plan,plan_start,monthly_start,monthly_end from public.students where id=s and active for update;
 if not found then raise exception 'inactive student';end if;
 insert into public.face_events(device_id,log_id,user_id,occurred_at) values(d,p_log_id,p_user_id,p_occurred_at) on conflict(device_id,log_id) do nothing returning id into e;
 if e is null then return jsonb_build_object('duplicate',true);end if;
 select * into balance from public.vitale_facial_package_balance(s,plan,monthly_start,monthly_end,plan_start);
 if plan in ('monthly_1','monthly_2','monthly_3')
    and (p_occurred_at at time zone 'America/Fortaleza')::date>=monthly_start
    and balance.used>=balance.lesson_limit then
  return jsonb_build_object('blocked',true,'reason','plan_exhausted','event_id',e);
 end if;
 if plan='test_2' then
  if p_occurred_at<plan_start then return jsonb_build_object('blocked',true,'reason','previous_cycle','event_id',e);end if;
  if balance.used>=balance.lesson_limit then
   return jsonb_build_object('blocked',true,'reason','plan_exhausted','event_id',e);end if;
  last_presence:=balance.last_presence;
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
 if plan is distinct from 'test_2' and a is null and exists(select 1 from public.attendance where student_id=s and (occurred_at at time zone 'America/Fortaleza')::date=(p_occurred_at at time zone 'America/Fortaleza')::date) then return jsonb_build_object('duplicate',true,'reason','same_day_without_second_appointment','event_id',e);end if;
 insert into public.attendance(student_id,appointment_id,face_event_id,occurred_at,source) values(s,a,e,p_occurred_at,'facial') returning id into p;
 if a is not null then update public.appointments set status='present' where id=a;end if;
 return jsonb_build_object('attendance_id',p,'requires_review',a is null);
end $function$;
