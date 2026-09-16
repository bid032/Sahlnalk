-- Allow anonymous (not logged in) users to read public payment display keys
-- from site_settings so the checkout page can show wallet/instapay numbers
-- before the user signs in.

begin;

-- Ensure the table has RLS enabled (safe if already enabled)
alter table public.site_settings enable row level security;

-- Grant SELECT to anon (required for PostgREST even with a policy)
grant select on public.site_settings to anon;

-- Drop older restrictive/duplicate anon policy if present
drop policy if exists "anon read public settings" on public.site_settings;

-- Public keys safe to expose without authentication
create policy "anon read public settings"
on public.site_settings
for select
to anon
using (
  key in (
    'brand',
    'contact',
    'payments',
    'checkout',
    'theme_mode',
    'hero',
    'socials',
    'stats',
    'wallet_number',
    'instapay_number',
    'paypal_client_id',
    'paypal_enabled',
    'usd_exchange_rate'
  )
);

commit;
