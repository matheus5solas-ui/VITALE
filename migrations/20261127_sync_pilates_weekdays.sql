create or replace function public.vitale_sync_pilates_weekdays()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scheduled integer[];
  old_scheduled integer[] := '{}';
  frequency integer;
begin
  frequency := case new.pilates_plan when 'monthly_1' then 1
    when 'monthly_2' then 2 when 'monthly_3' then 3 end;
  if new.activity is distinct from 'Pilates' or frequency is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.weekly_class_days is distinct from old.weekly_class_days then
      for weekday in 1..6 loop
        if not coalesce(weekday = any(new.weekly_class_days), false) then
          new.pilates_weekly_times[weekday] := null;
          new.pilates_weekly_shifts[weekday] := '';
        end if;
      end loop;
      return new;
    end if;
    if new.pilates_weekly_times is not distinct from old.pilates_weekly_times
      and new.pilates_weekly_shifts is not distinct from old.pilates_weekly_shifts then
      return new;
    end if;
    old_scheduled := array(select d from generate_series(1,6) d
      where old.pilates_weekly_times[d] is not null or old.pilates_weekly_shifts[d] <> '');
  end if;

  scheduled := array(select d from generate_series(1,6) d
    where new.pilates_weekly_times[d] is not null or new.pilates_weekly_shifts[d] <> '');
  if cardinality(scheduled) > frequency then
    raise exception 'A quantidade de dias com horário ou turno excede a frequência do plano.';
  end if;
  if cardinality(scheduled) < frequency then
    scheduled := array(select d from generate_series(1,6) d
      where d = any(scheduled) or
        (d = any(new.weekly_class_days) and not (d = any(old_scheduled))));
  end if;
  if cardinality(scheduled) > frequency then
    raise exception 'Confira os dias habituais e a frequência do plano antes de salvar.';
  end if;
  new.weekly_class_days := case when cardinality(scheduled) > 0 then scheduled end;
  return new;
end;
$$;

-- Recover explicitly configured weekdays where the existing day list was empty.
with schedules as (
  select id, array(select d from generate_series(1,6) d
    where pilates_weekly_times[d] is not null or pilates_weekly_shifts[d] <> '') as days,
    case pilates_plan when 'monthly_1' then 1 when 'monthly_2' then 2 when 'monthly_3' then 3 end as frequency
  from public.students
  where active and activity = 'Pilates' and weekly_class_days is null
)
update public.students s set weekly_class_days = schedules.days
from schedules where s.id = schedules.id and cardinality(schedules.days) between 1 and schedules.frequency;

create trigger vitale_sync_pilates_weekdays
before insert or update of weekly_class_days, pilates_weekly_times, pilates_weekly_shifts
on public.students for each row execute function public.vitale_sync_pilates_weekdays();
