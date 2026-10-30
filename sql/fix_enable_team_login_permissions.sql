-- Applied to Vitale production on 2026-10-29 via Supabase migration
-- fix_team_login_definer_privileges.
-- Minimal permissions fix: preserve original body and security checks.
ALTER FUNCTION public.enable_team_login(uuid,uuid,text,uuid) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.enable_team_login(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enable_team_login(uuid,uuid,text,uuid) TO service_role;
-- Verified: owner postgres; security definer true;
-- authenticated EXECUTE false; service_role EXECUTE true.
