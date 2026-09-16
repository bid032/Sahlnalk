ALTER TABLE public.account_inventory ADD COLUMN IF NOT EXISTS import_batch_id uuid;
CREATE INDEX IF NOT EXISTS account_inventory_batch_idx ON public.account_inventory(plan_id, import_batch_id);