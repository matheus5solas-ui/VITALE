-- Schema for assigned teacher and actual teacher, without changing facial presence.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS responsible_professional_id uuid REFERENCES public.professionals(user_id);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS taught_by_professional_id uuid REFERENCES public.professionals(user_id);
CREATE TABLE IF NOT EXISTS public.attendance_teacher_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 attendance_id uuid NOT NULL REFERENCES public.attendance(id),
 previous_professional_id uuid,
 new_professional_id uuid NOT NULL REFERENCES public.professionals(user_id),
 changed_by uuid NOT NULL REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_teacher_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_teacher_audit_admin_read ON public.attendance_teacher_audit
 FOR SELECT TO authenticated USING (vitale_private.role()='admin');
REVOKE ALL ON public.attendance_teacher_audit FROM anon,authenticated;
GRANT SELECT ON public.attendance_teacher_audit TO authenticated;
-- Teacher of one specific attendance; no edits to facial event, timestamp or source.
CREATE OR REPLACE FUNCTION public.assign_attendance_teacher(p_attendance_id uuid,p_professional_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE old_teacher uuid;
BEGIN
 IF vitale_private.role() <> 'admin' THEN RAISE EXCEPTION 'Somente administrador pode editar o professor da aula'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE user_id=p_professional_id AND active=true)
 THEN RAISE EXCEPTION 'Profissional nao esta ativo'; END IF;
 SELECT taught_by_professional_id INTO old_teacher FROM public.attendance WHERE id=p_attendance_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Presenca nao encontrada'; END IF;
 IF old_teacher IS NOT DISTINCT FROM p_professional_id THEN RETURN; END IF;
 UPDATE public.attendance SET taught_by_professional_id=p_professional_id WHERE id=p_attendance_id;
 INSERT INTO public.attendance_teacher_audit(attendance_id,previous_professional_id,new_professional_id,changed_by)
 VALUES(p_attendance_id,old_teacher,p_professional_id,auth.uid());
END $fn$;
REVOKE ALL ON FUNCTION public.assign_attendance_teacher(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_attendance_teacher(uuid,uuid) TO authenticated;
