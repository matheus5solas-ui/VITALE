alter table public.students
  add column if not exists pilates_weekly_shifts text[] not null
    default array['', '', '', '', '', '', '']
    check (
      array_ndims(pilates_weekly_shifts) = 1
      and array_lower(pilates_weekly_shifts, 1) = 1
      and cardinality(pilates_weekly_shifts) = 7
      and pilates_weekly_shifts <@ array['', 'morning', 'afternoon', 'evening']
    );
