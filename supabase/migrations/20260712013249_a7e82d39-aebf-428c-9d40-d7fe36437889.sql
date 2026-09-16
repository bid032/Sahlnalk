ALTER TABLE public.account_inventory
  ADD COLUMN IF NOT EXISTS spreadsheet_id text,
  ADD COLUMN IF NOT EXISTS sheet_title text,
  ADD COLUMN IF NOT EXISTS sheet_row_index integer,
  ADD COLUMN IF NOT EXISTS status_column_letter text;