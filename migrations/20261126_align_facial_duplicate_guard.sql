create or replace function vitale_private.guard_duplicate_facial_attendance()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if new.source='facial' and new.appointment_id is null and exists(
  select 1 from public.attendance a
  join public.students s on s.id=a.student_id
  where a.student_id=new.student_id
   and (a.occurred_at at time zone 'America/Fortaleza')::date=(new.occurred_at at time zone 'America/Fortaleza')::date
   and not exists(select 1 from public.attendance_voids v where v.attendance_id=a.id)
   and (s.pilates_plan is distinct from 'test_2'
        or (a.occurred_at>=s.test_plan_started_at and new.occurred_at<a.occurred_at+interval '30 minutes'))
 ) then
  raise exception 'Presença facial já registrada neste dia; segunda aula exige agendamento distinto';
 end if;
 return new;
end;
$$;
