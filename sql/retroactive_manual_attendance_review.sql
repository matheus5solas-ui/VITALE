-- REVIEW ONLY: never run in production before staging tests.
-- Allows an authenticated admin/reception to record a past Pilates class
-- without an appointment, preserving the original class date and audit actor.
CREATE OR REPLACE FUNCTION vitale_private.check_manual_attendance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $fn$
DECLARE
 s public.students;
 a public.appointments;
 actor_role text;
 local_date date;
 weekly_limit integer;
 weekly_used integer;
 week_start date;
BEGIN
 IF NEW.source <> 'manual' THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.recorded_by IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Autor invalido'; END IF;
 SELECT * INTO s FROM public.students WHERE id=NEW.student_id FOR UPDATE;
 IF NOT FOUND OR NOT s.active THEN RAISE EXCEPTION 'Aluno indisponivel'; END IF;
 IF NEW.appointment_id IS NULL THEN
   SELECT role INTO actor_role FROM public.staff
    WHERE user_id=auth.uid() AND active=true LIMIT 1;
   IF actor_role IS NULL OR actor_role NOT IN ('admin','reception')
      OR s.activity IS DISTINCT FROM 'Pilates'
   THEN RAISE EXCEPTION 'Somente recepcao/admin podem registrar aula sem agendamento'; END IF;
   IF NEW.occurred_at>now() OR NEW.occurred_at<now()-interval '30 days'
   THEN RAISE EXCEPTION 'Data retroativa invalida'; END IF;
 ELSE
   SELECT * INTO a FROM public.appointments
     WHERE id=NEW.appointment_id AND student_id=NEW.student_id FOR UPDATE;
   IF NOT FOUND OR a.status<>'scheduled'
      OR (s.pilates_plan IS DISTINCT FROM 'test_2' AND a.starts_at>now())
   THEN RAISE EXCEPTION 'Confira o agendamento'; END IF;
   IF EXISTS(SELECT 1 FROM public.attendance WHERE appointment_id=a.id)
   THEN RAISE EXCEPTION 'Presenca ja registrada' USING errcode='23505'; END IF;
 END IF;
 local_date:=(NEW.occurred_at AT TIME ZONE 'America/Fortaleza')::date;
 IF EXISTS(SELECT 1 FROM public.attendance
   WHERE student_id=s.id AND (occurred_at AT TIME ZONE 'America/Fortaleza')::date=local_date)
 THEN RAISE EXCEPTION 'Presenca ja registrada neste dia'; END IF;
 weekly_limit:=CASE s.pilates_plan WHEN 'monthly_1' THEN 1 WHEN 'monthly_2' THEN 2 WHEN 'monthly_3' THEN 3 ELSE NULL END;
 IF weekly_limit IS NOT NULL THEN
   week_start:=local_date-(EXTRACT(ISODOW FROM local_date)::integer-1);
   SELECT count(DISTINCT (occurred_at AT TIME ZONE 'America/Fortaleza')::date)
   INTO weekly_used FROM public.attendance
   WHERE student_id=s.id AND (occurred_at AT TIME ZONE 'America/Fortaleza')::date BETWEEN week_start AND week_start+6;
   IF weekly_used>=weekly_limit THEN RAISE EXCEPTION 'Limite semanal atingido'; END IF;
 END IF;
 IF s.pilates_plan='test_2' THEN
   IF NEW.occurred_at<s.test_plan_started_at
     OR (SELECT count(*) FROM public.attendance WHERE student_id=s.id AND occurred_at>=s.test_plan_started_at)>=2
   THEN RAISE EXCEPTION 'Pacote esgotado'; END IF;
   IF EXISTS(SELECT 1 FROM public.attendance WHERE student_id=s.id
      AND occurred_at>=s.test_plan_started_at
      AND NEW.occurred_at BETWEEN occurred_at-interval '30 minutes' AND occurred_at+interval '30 minutes')
   THEN RAISE EXCEPTION 'Esta aula ja foi registrada'; END IF;
 END IF;
 NEW.retain_until:=greatest(coalesce(NEW.retain_until,NEW.occurred_at+interval '17 months'),NEW.occurred_at+interval '17 months');
 RETURN NEW;
END $fn$;
-- Review: weekly makeup exception must be designed with package entitlements.
-- Review: do not apply until client uses authenticated insertion with actor.
