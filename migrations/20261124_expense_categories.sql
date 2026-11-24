alter table public.ledger
  drop constraint ledger_category_check,
  add constraint ledger_category_check
  check (category in ('pagamento', 'materiais', 'pessoal', 'agua', 'energia', 'maquinarios', 'outros'));
