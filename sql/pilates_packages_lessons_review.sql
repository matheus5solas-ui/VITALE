-- PROPOSTA PARA HOMOLOGACAO. NAO APLICAR EM PRODUCAO SEM REVISAR RLS E FLUXO FACIAL.
-- Cada renovacao gera novo pacote; historico nao e sobrescrito.
CREATE TABLE IF NOT EXISTS public.pilates_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES public.students(id),
 plan text NOT NULL CHECK (plan IN ('monthly_1','monthly_2','monthly_3')),
 total_lessons integer NOT NULL CHECK (total_lessons IN (4,8,12)),
 weekly_lessons integer NOT NULL CHECK (weekly_lessons BETWEEN 1 AND 3),
 starts_on date NOT NULL,
 expires_on date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES auth.users(id),
 CHECK (expires_on>=starts_on),
 CHECK (total_lessons=weekly_lessons*4)
);
CREATE INDEX IF NOT EXISTS pilates_packages_student_dates
 ON public.pilates_packages(student_id,starts_on DESC);

-- Cada aula e um direito do pacote, e nao um agendamento.
-- scheduled_week_monday fixa a semana original para a falta automatica.
CREATE TABLE IF NOT EXISTS public.pilates_package_lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 package_id uuid NOT NULL REFERENCES public.pilates_packages(id),
 lesson_number integer NOT NULL CHECK (lesson_number BETWEEN 1 AND 12),
 scheduled_week_monday date NOT NULL,
 attendance_id uuid UNIQUE REFERENCES public.attendance(id),
 makeup_attendance_id uuid UNIQUE REFERENCES public.attendance(id),
 makeup_recorded_by uuid REFERENCES auth.users(id),
 makeup_recorded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(package_id,lesson_number),
 CHECK (makeup_attendance_id IS NULL OR attendance_id IS NULL)
);
CREATE INDEX IF NOT EXISTS pilates_package_lessons_package_week
 ON public.pilates_package_lessons(package_id,scheduled_week_monday);

-- Estado derivado: nao depende de um PC ligado nem de cron para pintar amarelo.
-- Domingo em Fortaleza: a semana anterior encerrou; falta sem presenca fica amarela.
CREATE OR REPLACE VIEW public.pilates_lesson_status
 WITH (security_invoker=true)
 AS SELECT l.id,l.package_id,l.lesson_number,l.scheduled_week_monday,
  CASE
   WHEN l.attendance_id IS NOT NULL OR l.makeup_attendance_id IS NOT NULL THEN 'present'
   WHEN ((now() AT TIME ZONE 'America/Fortaleza')::date >= l.scheduled_week_monday+6)
     THEN 'absent'
   ELSE 'available'
  END AS status,
  l.attendance_id,l.makeup_attendance_id
 FROM public.pilates_package_lessons l;

-- RLS: sem permissao de escrita direta. Criacao, renovacao e reposicao
-- deverao ser feitas por RPC autenticada com verificacao de admin/recepcao,
-- bloqueio de linha, idempotencia e auditoria.
ALTER TABLE public.pilates_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilates_package_lessons ENABLE ROW LEVEL SECURITY;
-- Politicas de SELECT e RPCs serao adicionadas depois de validar os papeis.
-- ATENCAO: essa view nao substitui a verificacao transacional de limite
-- no webhook facial; a associacao de presencas ainda precisa ser implementada.
