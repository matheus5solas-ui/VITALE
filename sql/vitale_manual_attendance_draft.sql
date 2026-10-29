-- DRAFT: revisar e aplicar em homologacao antes de publicar o front-end.
-- Presenca manual de Pilates com bloqueio semanal, idempotencia por dia e auditoria.
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS manual_reason text;

CREATE OR REPLACE FUNCTION public.vitale_manual_pilates_attendance(
  p_student_id uuid, p_reason text, p_appointment_id uuid DEFAULT NULL, p_occurred_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_actor uuid := (select auth.uid());
 v_role text;
 v_plan text;
 v_start timestamptz;
 v_limit integer;
 v_week_start date;
 v_today date;
 v_presence_date date;
 v_when timestamptz;
 v_count integer;
 v_existing uuid;
 v_id uuid;
BEGIN
 SELECT role INTO v_role FROM public.staff WHERE user_id=v_actor AND active;
 IF v_actor IS NULL OR v_role NOT IN ('admin','reception') THEN
   RAISE EXCEPTION 'Sem permissao para registrar presenca manual';
 END IF;
 IF length(trim(coalesce(p_reason,''))) < 5 OR length(coalesce(p_reason,''))>500 THEN
   RAISE EXCEPTION 'Informe um motivo de 5 a 500 caracteres';
 END IF;
 SELECT pilates_plan,test_plan_started_at INTO v_plan,v_start
 FROM public.students WHERE id=p_student_id AND active AND activity='Pilates' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aluno de Pilates nao encontrado ou inativo'; END IF;
 IF p_appointment_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.appointments WHERE id=p_appointment_id
   AND student_id=p_student_id AND activity='Pilates' AND status IN ('scheduled','present','completed')
 ) THEN RAISE EXCEPTION 'Agendamento invalido para este aluno'; END IF;
 v_today := (now() AT TIME ZONE 'America/Fortaleza')::date;
 v_when := coalesce(p_occurred_at,now());
 v_presence_date := (v_when AT TIME ZONE 'America/Fortaleza')::date;
 IF v_when>now()+interval '5 minutes' OR v_presence_date<v_today-30 THEN
   RAISE EXCEPTION 'Data de presenca fora do prazo permitido';
 END IF;
 SELECT id INTO v_existing FROM public.attendance
 WHERE student_id=p_student_id AND (occurred_at AT TIME ZONE 'America/Fortaleza')::date=v_presence_date
 ORDER BY occurred_at LIMIT 1;
 IF v_existing IS NOT NULL THEN
   RETURN jsonb_build_object('duplicate',true,'reason','same_day','message','Presenca ja registrada');
 END IF;
 IF v_plan='test_2' THEN
   IF v_start IS NULL THEN RAISE EXCEPTION 'Pacote de teste sem data de inicio'; END IF;
   SELECT count(*) INTO v_count FROM public.attendance
   WHERE student_id=p_student_id AND occurred_at>=v_start;
   v_limit:=2;
 ELSE
   v_limit:=CASE v_plan WHEN 'monthly_1' THEN 1 WHEN 'monthly_2' THEN 2 WHEN 'monthly_3' THEN 3 ELSE NULL END;
   IF v_limit IS NULL THEN RAISE EXCEPTION 'Plano sem limite configurado'; END IF;
   v_week_start:=v_presence_date-((extract(isodow from v_presence_date)::integer)-1);
   SELECT count(DISTINCT (occurred_at AT TIME ZONE 'America/Fortaleza')::date) INTO v_count FROM public.attendance
   WHERE student_id=p_student_id
     AND (occurred_at AT TIME ZONE 'America/Fortaleza')::date BETWEEN v_week_start AND v_week_start+6;
 END IF;
 IF v_count>=v_limit THEN
   RETURN jsonb_build_object('blocked',true,'reason','plan_exhausted','message','Limite de aulas atingido. Solicite autorizacao da recepcao.');
 END IF;
 INSERT INTO public.attendance(student_id,appointment_id,occurred_at,source,recorded_by,manual_reason)
 VALUES (p_student_id,p_appointment_id,v_when,'manual',v_actor,trim(p_reason))
 RETURNING id INTO v_id;
 IF p_appointment_id IS NOT NULL THEN
   UPDATE public.appointments SET status='present' WHERE id=p_appointment_id AND status='scheduled';
 END IF;
 RETURN jsonb_build_object('attendance_id',v_id,'message','Presenca manual registrada');
END $$;

REVOKE ALL ON FUNCTION public.vitale_manual_pilates_attendance(uuid,text,uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vitale_manual_pilates_attendance(uuid,text,uuid,timestamptz) TO authenticated;
-- ATENCAO: a politica de INSERT atual continua ativa ate migrarmos TODOS os fluxos
-- de presenca manual (inclusive o botao da agenda) para esta RPC.
-- Nao remover a politica neste arquivo de preparacao.
-- PENDENCIA: fazer a facial usar a mesma validacao atomica de saldo e duplicidade.


-- BLOQUEIO ATUAL: vitale_private.check_manual_attendance() exige agendamento
-- e recorded_by=auth.uid(). A RPC acima NAO funciona sem uma migracao
-- revisada desse trigger; nao executar este rascunho isoladamente.
