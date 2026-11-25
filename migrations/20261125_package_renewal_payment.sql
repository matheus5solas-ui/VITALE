create function public.renew_monthly_package_with_payment(
  p_student_id uuid, p_plan text, p_previous_start date, p_previous_end date,
  p_start date, p_end date, p_amount numeric, p_method text,
  p_paid_on date, p_installments integer
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_end < p_start + 29
     or p_amount is null or not (p_amount between 0.01 and 9999999999.99)
     or p_amount <> round(p_amount, 2)
     or p_method is null or p_method not in ('Pix','Dinheiro','Cartão','Transferência','Boleto')
     or p_paid_on is null or p_paid_on > (now() at time zone 'America/Fortaleza')::date
     or p_installments is null or p_installments not between 1 and 24
     or (p_method <> 'Cartão' and p_installments <> 1) then
    raise exception 'Confira as datas da renovação e os dados do pagamento.';
  end if;

  update public.students
  set plan_started_on = p_start, plan_expires_on = p_end
  where id = p_student_id and active and activity = 'Pilates'
    and pilates_plan in ('monthly_1','monthly_2','monthly_3') and pilates_plan = p_plan
    and plan_started_on is not distinct from p_previous_start
    and plan_expires_on is not distinct from p_previous_end
    and (plan_started_on, plan_expires_on) is distinct from (p_start, p_end);
  if not found then
    raise exception 'A vigência já está cadastrada ou o pacote foi alterado. Atualize a página e confira.';
  end if;

  insert into public.ledger (kind, category, student_id, description, amount, method, paid_on, installments)
  values ('income', 'pagamento', p_student_id,
    'Renovação de Pilates · ' || to_char(p_start,'DD/MM/YYYY') || ' a ' || to_char(p_end,'DD/MM/YYYY'),
    p_amount, p_method, p_paid_on, p_installments);
end;
$$;

revoke all on function public.renew_monthly_package_with_payment(uuid,text,date,date,date,date,numeric,text,date,integer)
from public, anon;
grant execute on function public.renew_monthly_package_with_payment(uuid,text,date,date,date,date,numeric,text,date,integer)
to authenticated;
