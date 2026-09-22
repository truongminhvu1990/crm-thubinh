-- Customer module: align `customers` table with the app's field set.
-- Existing columns kept as-is (facebook, zalo, birthday, notes, city, vip_level, etc.).
-- Run this once in the Supabase SQL editor.

alter table customers
  add column if not exists address text,
  add column if not exists source text,
  add column if not exists last_contacted timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Normalize vip_level to text so the app can write 'VIP' / '' / null consistently,
-- regardless of whatever type it currently has.
alter table customers
  alter column vip_level type text using vip_level::text;

-- Keep updated_at current on every row change.
create or replace function set_customers_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at
before update on customers
for each row execute function set_customers_updated_at();
