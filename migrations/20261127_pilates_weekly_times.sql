alter table public.students
  add column if not exists pilates_weekly_times time[] not null
    default array[null, null, null, null, null, null, null]::time[]
    check (
      array_ndims(pilates_weekly_times) = 1
      and array_lower(pilates_weekly_times, 1) = 1
      and cardinality(pilates_weekly_times) = 7
    );
