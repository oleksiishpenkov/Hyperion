-- Контейнерные терминалы Европы. Загрузка: Supabase → Table editor → terminals → Import data from CSV → data/terminals_europe.csv
create table if not exists public.terminals (
  code       text primary key,                 -- UN/LOCODE-SMDG: BEANR-K1742, NLRTM-NLMVII
  smdg_code  text not null,                    -- K1742, NLMVII, DDE …
  name       text not null,
  operator   text,
  city       text,
  country    char(2) not null,
  lat        double precision,                 -- WGS84
  lon        double precision,
  address    text,
  website    text,
  remarks    text,
  kind       text check (kind in ('sea', 'inland')),
  source     text                              -- SMDG или manual (координаты сверить)
);
create index if not exists terminals_country_idx on public.terminals (country);
alter table public.terminals enable row level security;
create policy "terminals readable by signed-in users" on public.terminals for select to authenticated using (true);
