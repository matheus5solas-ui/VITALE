alter table public.students add column if not exists plan_renewal_count integer not null default 0;
alter table public.attendance add column if not exists retain_until timestamptz not null default (now()+interval '17 months');
create or replace function vitale_private.set_test_plan_start() returns trigger language plpgsql set search_path='' as $$
begin
 if new.pilates_plan='test_2' and (tg_op='INSERT' or old.pilates_plan is distinct from new.pilates_plan or new.plan_renewal_count=old.plan_renewal_count+1) then new.test_plan_started_at=now();
 else new.test_plan_started_at=case when tg_op='UPDATE' then old.test_plan_started_at else null end;end if;
 return new;
end $$;
create or replace function vitale_private.check_manual_attendance() returns trigger language plpgsql set search_path='' as $$
declare s public.students; a public.appointments;
begin
 if new.source<>'manual' then return new;end if;
 select * into s from public.students where id=new.student_id for update;
 if not found or not s.active then raise exception 'Aluno indisponível';end if;
 select * into a from public.appointments where id=new.appointment_id and student_id=new.student_id for update;
 if not found or a.status<>'scheduled' or a.starts_at>now() then raise exception 'Confira o agendamento';end if;
 if new.recorded_by is distinct from auth.uid() then raise exception 'Autor inválido';end if;
 if exists(select 1 from public.attendance where appointment_id=a.id) then raise exception 'Presença já registrada' using errcode='23505';end if;
 if s.pilates_plan='test_2' and (new.occurred_at<s.test_plan_started_at or (select count(*) from public.attendance where student_id=s.id and appointment_id is not null and occurred_at>=s.test_plan_started_at)>=2) then raise exception 'Pacote esgotado. Renove a matrícula antes de confirmar.';end if;
 new.retain_until=greatest(new.retain_until,new.occurred_at+interval '17 months');
 return new;
end $$;
drop trigger if exists attendance_manual_guard on public.attendance;
create trigger attendance_manual_guard before insert on public.attendance for each row execute function vitale_private.check_manual_attendance();