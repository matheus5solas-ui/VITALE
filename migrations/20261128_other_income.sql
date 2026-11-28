alter table public.ledger
  drop constraint ledger_category_check,
  drop constraint ledger_check,
  add constraint ledger_check check (
    (kind = 'income' and category = 'pagamento' and student_id is not null)
    or (kind = 'income' and category in ('venda_meias', 'venda_blusas', 'aluguel_salas', 'outras_receitas') and student_id is null)
    or (kind = 'expense' and category in ('materiais', 'pessoal', 'agua', 'energia', 'maquinarios', 'outros') and student_id is null)
  );
