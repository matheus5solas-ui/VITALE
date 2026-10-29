-- Review before applying. Existing enable_team_login uses invoker privileges
-- and reads auth.users, which is denied to service_role via PostgREST.
-- Keep function in public for existing Edge Function RPC call.
CREATE OR REPLACE FUNCTION public.enable_team_login(
 p_id uuid,p_user uuid,p_username text,p_admin uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE m public.team_members;
BEGIN
 -- Do not trust p_admin alone: compare with the authenticated JWT.
 -- Supabase service-role request uses a service JWT without a user claim,
 -- so only the Edge Function should invoke this RPC with service_role.
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 THEN RAISE EXCEPTION 'Acesso restrito ao servico'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.staff
    WHERE user_id=p_admin AND active AND role='admin')
 THEN RAISE EXCEPTION 'Acesso restrito'; END IF;
 SELECT * INTO m FROM public.team_members WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT m.active THEN RAISE EXCEPTION 'Cadastro indisponivel'; END IF;
 IF m.user_id IS NOT NULL AND m.user_id<>p_user
 THEN RAISE EXCEPTION 'Acesso ja vinculado'; END IF;
 IF EXISTS(SELECT 1 FROM public.staff WHERE user_id=p_user AND role='admin')
 THEN RAISE EXCEPTION 'Administrador nao pode ser alterado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND email=p_username||'@login.vitale.invalid')
 THEN RAISE EXCEPTION 'Credencial invalida'; END IF;
 UPDATE public.team_members SET username=p_username,user_id=p_user,
   email=p_username||'@login.vitale.invalid',accepted_at=now(),
   invite_hash=null,invited_at=null,invite_expires_at=null WHERE id=p_id;
 INSERT INTO public.staff(user_id,name,role,active)
 VALUES(p_user,m.name,m.role,true)
 ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,role=excluded.role,active=true;
 IF m.role='professional' THEN
   INSERT INTO public.professionals(user_id,name,active)
   VALUES(p_user,m.name,true)
   ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,active=true;
 ELSE UPDATE public.professionals SET active=false WHERE user_id=p_user; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.enable_team_login(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enable_team_login(uuid,uuid,text,uuid) TO service_role;
-- WARNING: service-role credentials must remain only in the Edge Function.
-- SECURITY DEFINER ownership must be a trusted migration role with auth.users read.
