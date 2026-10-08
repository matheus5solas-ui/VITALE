create or replace function vitale_private.check_manual_attendance() returns trigger language plpgsql set search_path='' as $$
declare s public.students; a public.appointments;
begin
 if new.source<>'manual' then return new;end if;
 select * into s from public.students where id=new.student_id for update;
 if not found or not s.active then raise exception 'Aluno indisponível';end if;
 select * into a from public.appointments where id=new.appointment_id and student_id=new.student_id for update;
 if not found or a.status<>'scheduled' or (s.pilates_plan is distinct from 'test_2' and a.starts_at>now()) then raise exception 'Confira o agendamento';end if;
 if new.recorded_by is distinct from auth.uid() then raise exception 'Autor inválido';end if;
 if exists(select 1 from public.attendance where appointment_id=a.id) then raise exception 'Presença já registrada' using errcode='23505';end if;
 if s.pilates_plan='test_2' and (new.occurred_at<s.test_plan_started_at or (select count(*) from public.attendance where student_id=s.id and occurred_at>=s.test_plan_started_at)>=2) then raise exception 'Pacote esgotado. Renove a matrícula antes de confirmar.';end if;
 if s.pilates_plan='test_2' and exists(select 1 from public.attendance where student_id=s.id and occurred_at>=s.test_plan_started_at and new.occurred_at<occurred_at+interval '30 minutes') then raise exception 'Esta aula já foi registrada. Aguarde 30 minutos para outra aula.';end if;
 new.retain_until=greatest(new.retain_until,new.occurred_at+interval '17 months');
 return new;
end $$;
