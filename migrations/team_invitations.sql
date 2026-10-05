alter table public.team_members add column invite_hash text, add column invited_at timestamptz, add column invite_expires_at timestamptz, add column accepted_at timestamptz;
revoke select on public.team_members from authenticated;
grant select(id,name,email,role,registration,active,user_id,created_at,invited_at,invite_expires_at,accepted_at) on public.team_members to authenticated;
create function vitale_private.edit_team(p_id uuid,p_name text,p_email text,p_role text,p_registration text) returns uuid language plpgsql security definer set search_path='' as $$ declare member public.team_members; begin
if vitale_private.role() is distinct from 'admin' then raise exception 'Acesso restrito'; end if;
if p_role not in ('professional','reception') or length(trim(p_name))=0 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Dados inválidos'; end if;
if p_id is null then insert into public.team_members(name,email,role,registration) values(trim(p_name),lower(trim(p_email)),p_role,p_registration) returning id into p_id;
else select * into member from public.team_members where id=p_id for update; if not found then raise exception 'Cadastro não encontrado'; end if;
if member.user_id is not null and lower(trim(p_email))<>member.email then raise exception 'E-mail de acesso já habilitado não pode ser trocado aqui'; end if;
update public.team_members set name=trim(p_name),email=lower(trim(p_email)),role=p_role,registration=p_registration,invite_hash=null,invited_at=null,invite_expires_at=null where id=p_id;
if member.user_id is not null then
update public.staff set name=trim(p_name),role=p_role where user_id=member.user_id and role<>'admin';
if p_role='professional' then insert into public.professionals(user_id,name,active) values(member.user_id,trim(p_name),true) on conflict(user_id) do update set name=excluded.name,active=true; else update public.professionals set active=false where user_id=member.user_id; end if;
end if; end if; return p_id; end $$;
revoke all on function vitale_private.edit_team(uuid,text,text,text,text) from public,anon;
grant execute on function vitale_private.edit_team(uuid,text,text,text,text) to authenticated;
create function public.edit_team(p_id uuid,p_name text,p_email text,p_role text,p_registration text) returns uuid language sql security invoker set search_path='' as $$ select vitale_private.edit_team(p_id,p_name,p_email,p_role,p_registration) $$;
revoke all on function public.edit_team(uuid,text,text,text,text) from public,anon;
grant execute on function public.edit_team(uuid,text,text,text,text) to authenticated;
-- Retire the old route which could enable accounts without a valid invitation.
revoke execute on function public.save_team(text,text,text,text) from authenticated;
revoke execute on function vitale_private.save_team(text,text,text,text) from authenticated;
create function public.prepare_team_invite(p_id uuid,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$ declare m public.team_members; begin
select * into m from public.team_members where id=p_id and active for update; if not found then raise exception 'Cadastro não encontrado'; end if;
if m.user_id is not null then raise exception 'Acesso já habilitado'; end if;
if m.invited_at>now()-interval '60 seconds' then raise exception 'Aguarde 60 segundos antes de reenviar'; end if;
if exists(select 1 from auth.users u join public.staff s on s.user_id=u.id where lower(u.email)=m.email and s.active) then raise exception 'Este e-mail já possui acesso à clínica'; end if;
update public.team_members set invite_hash=p_hash,invited_at=now(),invite_expires_at=now()+interval '5 minutes' where id=p_id;
return jsonb_build_object('email',m.email,'expires_at',now()+interval '5 minutes'); end $$;
create function public.check_team_invite(p_hash text,p_user uuid) returns uuid language plpgsql security invoker set search_path='' as $$ declare mid uuid; begin
select m.id into mid from public.team_members m join auth.users u on lower(u.email)=m.email where u.id=p_user and u.email_confirmed_at is not null and m.active and m.user_id is null and m.invite_hash=p_hash and m.invite_expires_at>clock_timestamp();
if mid is null then raise exception 'Convite expirado ou substituído. Solicite um novo envio à clínica.'; end if; return mid; end $$;
create function public.accept_team_invite(p_hash text,p_user uuid) returns uuid language plpgsql security invoker set search_path='' as $$ declare mid uuid; m public.team_members; begin
mid:=public.check_team_invite(p_hash,p_user); select * into m from public.team_members where id=mid for update;
-- Check again after acquiring the lock, including resends and edits.
perform public.check_team_invite(p_hash,p_user);
if exists(select 1 from public.staff where user_id=p_user and role='admin') then raise exception 'Administrador não pode ser alterado'; end if;
insert into public.staff(user_id,name,role,active) values(p_user,m.name,m.role,true) on conflict(user_id) do update set name=excluded.name,role=excluded.role,active=true;
if m.role='professional' then insert into public.professionals(user_id,name,active) values(p_user,m.name,true) on conflict(user_id) do update set name=excluded.name,active=true; end if;
update public.team_members set user_id=p_user,accepted_at=now(),invite_hash=null where id=mid; return mid; end $$;
revoke all on function public.prepare_team_invite(uuid,text),public.check_team_invite(text,uuid),public.accept_team_invite(text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_team_invite(uuid,text),public.check_team_invite(text,uuid),public.accept_team_invite(text,uuid) to service_role;
