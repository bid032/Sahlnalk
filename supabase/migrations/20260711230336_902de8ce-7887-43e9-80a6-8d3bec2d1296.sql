-- Add multi-select account types column while keeping legacy single account_type for compatibility.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS account_types public.account_type[] NOT NULL DEFAULT '{}';

-- Backfill from existing single account_type
UPDATE public.products
SET account_types = CASE
  WHEN account_type = 'both' THEN ARRAY['shared','private']::public.account_type[]
  ELSE ARRAY[account_type]::public.account_type[]
END
WHERE array_length(account_types, 1) IS NULL OR array_length(account_types, 1) = 0;