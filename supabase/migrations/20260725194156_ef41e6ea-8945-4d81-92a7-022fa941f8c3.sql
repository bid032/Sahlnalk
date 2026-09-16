ALTER TABLE public.products ADD COLUMN IF NOT EXISTS loading_icon_url TEXT;
ALTER TABLE public.account_inventory ADD COLUMN IF NOT EXISTS account_type TEXT;