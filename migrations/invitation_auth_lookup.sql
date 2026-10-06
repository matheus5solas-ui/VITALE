create function vitale_private.confirmed_auth_email(p_user uuid) returns text language sql stable security definer set search_path='' as $$ select lower(email) from auth.users where id=p_user and email_confirmed_at is not null $$;
create function vitale_private.email_has_staff_access(p_email text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.users u join public.staff s on s.user_id=u.id where lower(u.email)=lower(p_email) and s.active) $$;
revoke all on function vitale_private.confirmed_auth_email(uuid),vitale_private.email_has_staff_access(text) from public,anon,authenticated;
grant usage on schema vitale_private to service_role;
grant execute on function vitale_private.confirmed_auth_email(uuid),vitale_private.email_has_staff_access(text) to service_role;
create or replace function public.prepare_team_invite(p_id uuid,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$ declare m public.team_members; begin
select * into m from public.team_members where id=p_id and active for update; if not found then raise exception 'Cadastro não encontrado'; end if;
if m.user_id is not null then raise exception 'Acesso já habilitado'; end if;
if m.invited_at>now()-interval '60 seconds' then raise exception 'Aguarde 60 segundos antes de reenviar'; end if;
if vitale_private.email_has_staff_access(m.email) then raise exception 'Este e-mail já possui acesso à clínica'; end if;
update public.team_members set invite_hash=p_hash,invited_at=now(),invite_expires_at=now()+interval '5 minutes' where id=p_id;
return jsonb_build_object('email',m.email,'expires_at',now()+interval '5 minutes'); end $$;
create or replace function public.check_team_invite(p_hash text,p_user uuid) returns uuid language plpgsql security invoker set search_path='' as $$ declare mid uuid; begin
select m.id into mid from public.team_members m where m.email=vitale_private.confirmed_auth_email(p_user) and m.active and m.user_id is null and m.invite_hash=p_hash and m.invite_expires_at>clock_timestamp();
if mid is null then raise exception 'Convite expirado ou substituído. Solicite um novo envio à clínica.'; end if; return mid; end $$;

