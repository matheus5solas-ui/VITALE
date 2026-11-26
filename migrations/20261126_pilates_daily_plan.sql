alter table public.students
  drop constraint students_pilates_plan_check,
  add constraint students_pilates_plan_check
    check (pilates_plan in ('monthly_1', 'monthly_2', 'monthly_3', 'test_2', 'daily'));
