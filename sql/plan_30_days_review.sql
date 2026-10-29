-- RASCUNHO: aplicar somente apos revisao dos fluxos de renovacao e facial.
-- A validade padrao e 30 dias, mas recepcao pode escolher datas.
ALTER TABLE public.students
 ADD COLUMN IF NOT EXISTS plan_started_on date,
 ADD COLUMN IF NOT EXISTS plan_expires_on date;
ALTER TABLE public.students
 ADD CONSTRAINT vitale_plan_dates_order
 CHECK (plan_started_on IS NULL OR plan_expires_on IS NULL OR plan_expires_on>=plan_started_on);
-- Nao preencher datas antigas automaticamente: confirmar inicio de cada aluno.
-- O proximo passo e criar renovacoes historicas em tabela separada,
-- para que a troca de datas nao apague o saldo de pacotes anteriores.
