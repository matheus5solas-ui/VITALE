create or replace function public.enforce_minimum_monthly_package()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.activity, new.pilates_plan, new.plan_started_on, new.plan_expires_on)
       is not distinct from
       (old.activity, old.pilates_plan, old.plan_started_on, old.plan_expires_on) then
      return new;
    end if;
  end if;

  if new.activity = 'Pilates'
     and new.pilates_plan in ('monthly_1', 'monthly_2', 'monthly_3')
     and (new.plan_started_on is null
          or new.plan_expires_on < new.plan_started_on + 29) then
    raise exception using errcode = '23514',
      message = 'Informe o início do pacote mensal e uma vigência de pelo menos 30 dias, contando o dia inicial.';
  end if;
  return new;
end;
$$;

create trigger enforce_minimum_monthly_package
before insert or update of activity, pilates_plan, plan_started_on, plan_expires_on
on public.students
for each row execute function public.enforce_minimum_monthly_package();
