-- Migração a revisar em homologação antes da aplicação.
-- Preserva o trigger existente, mas permite presença manual retroativa
-- sem agendamento exclusivamente a admin/recepção autenticados.
-- Todas as presenças mensais (facial e manual) obedecem à mesma regra.
CREATE OR REPLACE FUNCTION vitale_private.check_manual_attendance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $fn$
DECLARE
 s public.students;
 a public.appointments;
 actor_role text;
 limit_week integer;
 local_date date;
 monday date;
 used_count integer;
BEGIN
 SELECT * INTO s FROM public.students WHERE id=NEW.student_id FOR UPDATE;
 IF NOT FOUND OR NOT s.active THEN RAISE EXCEPTION 'Aluno indisponivel'; END IF;
 local_date := (NEW.occurred_at AT TIME ZONE 'America/Fortaleza')::date;
 IF NEW.source='manual' THEN
   IF NEW.recorded_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Autor invalido'; END IF;
   SELECT role INTO actor_role FROM public.staff WHERE user_id=auth.uid() AND active;
   IF NEW.appointment_id IS NULL THEN
     IF actor_role NOT IN ('admin','reception') OR s.activity<>'Pilates' THEN
       RAISE EXCEPTION 'Registro sem agendamento restrito a recepcao';
     END IF;
     IF NEW.occurred_at>now()+interval '5 minutes'
       OR NEW.occurred_at<now()-interval '30 days' THEN
       RAISE EXCEPTION 'Data fora do prazo para registro retroativo';
     END IF;
   ELSE
     SELECT * INTO a FROM public.appointments
       WHERE id=NEW.appointment_id AND student_id=NEW.student_id FOR UPDATE;
     IF NOT FOUND OR a.status<>'scheduled'
       OR (s.pilates_plan IS DISTINCT FROM 'test_2' AND a.starts_at>now())
       THEN RAISE EXCEPTION 'Confira o agendamento'; END IF;
   END IF;
 END IF;
 IF s.activity='Pilates' AND s.pilates_plan IN ('monthly_1','monthly_2','monthly_3') THEN
   IF EXISTS (SELECT 1 FROM public.attendance
     WHERE student_id=s.id AND (occurred_at AT TIME ZONE 'America/Fortaleza')::date=local_date)
     THEN RAISE EXCEPTION 'Presenca ja registrada neste dia'; END IF;
   limit_week:=CASE s.pilates_plan WHEN 'monthly_1' THEN 1 WHEN 'monthly_2' THEN 2 ELSE 3 END;
   monday:=local_date-(EXTRACT(ISODOW FROM local_date)::integer-1);
   SELECT count(DISTINCT (occurred_at AT TIME ZONE 'America/Fortaleza')::date)
     INTO used_count FROM public.attendance
     WHERE student_id=s.id AND (occurred_at AT TIME ZONE 'America/Fortaleza')::date BETWEEN monday AND monday+6;
   IF used_count>=limit_week THEN RAISE EXCEPTION 'Limite semanal atingido. Solicite autorizacao.'; END IF;
 END IF;
 IF NEW.source='manual' AND NEW.appointment_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM public.attendance WHERE appointment_id=NEW.appointment_id)
   THEN RAISE EXCEPTION 'Presenca ja registrada' USING errcode='23505'; END IF;
 IF s.pilates_plan='test_2' THEN
   IF s.test_plan_started_at IS NULL OR NEW.occurred_at<s.test_plan_started_at
     OR (SELECT count(*) FROM public.attendance WHERE student_id=s.id AND occurred_at>=s.test_plan_started_at)>=2
     THEN RAISE EXCEPTION 'Pacote esgotado'; END IF;
   IF EXISTS(SELECT 1 FROM public.attendance WHERE student_id=s.id
      AND occurred_at>=s.test_plan_started_at
      AND NEW.occurred_at BETWEEN occurred_at-interval '30 minutes' AND occurred_at+interval '30 minutes')
     THEN RAISE EXCEPTION 'Esta aula ja foi registrada'; END IF;
 END IF;
 NEW.retain_until:=greatest(NEW.retain_until,NEW.occurred_at+interval '17 months');
 RETURN NEW;
END $fn$;
