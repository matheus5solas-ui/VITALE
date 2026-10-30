-- Delete only unlinked team records; never delete auth users or staff.
CREATE OR REPLACE FUNCTION public.delete_unlinked_team_member(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid() AND role='admin' AND active)
 THEN RAISE EXCEPTION 'Somente administrador pode excluir colaboradores'; END IF;
 DELETE FROM public.team_members
 WHERE id=p_id AND user_id IS NULL AND username IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cadastro com acesso vinculado: exclusao bloqueada para preservar historico'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.delete_unlinked_team_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_unlinked_team_member(uuid) TO authenticated;
