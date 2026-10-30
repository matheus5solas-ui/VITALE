-- Applied to production: restrict ledger to administrator only.
DROP POLICY IF EXISTS ledger_read ON public.ledger;
CREATE POLICY ledger_read ON public.ledger FOR SELECT TO authenticated
 USING (vitale_private.role() = 'admin');
DROP POLICY IF EXISTS ledger_insert ON public.ledger;
CREATE POLICY ledger_insert ON public.ledger FOR INSERT TO authenticated
 WITH CHECK (recorded_by = auth.uid() AND vitale_private.role() = 'admin');
