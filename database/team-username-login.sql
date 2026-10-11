alter table public.team_members add column username text unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
create function public.enable_team_login(p_id uuid,p_user uuid,p_username text,p_admin uuid) returns void language plpgsql security invoker set search_path='' as $$
declare m public.team_members;
begin
if not exists(select 1 from public.staff where user_id=p_admin and active and role='admin') then raise exception 'Acesso restrito'; end if;
select * into m from public.team_members where id=p_id for update;
if not found or not m.active then raise exception 'Cadastro indisponível'; end if;
if m.user_id is not null and m.user_id<>p_user then raise exception 'Acesso já vinculado'; end if;
if exists(select 1 from public.staff where user_id=p_user and role='admin') then raise exception 'Administrador não pode ser alterado'; end if;
if not exists(select 1 from auth.users where id=p_user and email=p_username||'@login.vitale.invalid') then raise exception 'Credencial inválida'; end if;
update public.team_members set username=p_username,user_id=p_user,email=p_username||'@login.vitale.invalid',accepted_at=now(),invite_hash=null,invited_at=null,invite_expires_at=null where id=p_id;
insert into public.staff(user_id,name,role,active) values(p_user,m.name,m.role,true) on conflict(user_id) do update set name=excluded.name,role=excluded.role,active=true;
if m.role='professional' then
insert into public.professionals(user_id,name,active) values(p_user,m.name,true) on conflict(user_id) do update set name=excluded.name,active=true;
else update public.professionals set active=false where user_id=p_user; end if;
end $$;
revoke all on function public.enable_team_login(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.enable_team_login(uuid,uuid,text,uuid) to service_role;