-- Таблица портов Европы (UN/LOCODE). Загрузка: Supabase → Table editor → ports → Import data from CSV → data/ports_europe.csv
create table if not exists public.ports (
  unlocode            text primary key,          -- BEANR, NLRTM …
  name                text not null,             -- без диакритики: Liege, Gdansk
  name_local          text,                      -- как в UN/LOCODE: Liège, Gdańsk
  country             char(2) not null,
  subdivision         text,
  lat                 double precision,          -- десятичные градусы, WGS84
  lon                 double precision,
  functions           text,                      -- 1 порт, 2 ж/д, 3 авто, 4 аэропорт, 6 мультимодальный …
  status              text,                      -- статус записи UN/LOCODE
  main_container_port boolean default false,
  name_en             text,                      -- Antwerp, Ghent, Genoa …
  coord_source        text                       -- UN/LOCODE или OSM/Wikidata
);
create index if not exists ports_country_idx on public.ports (country);
create index if not exists ports_name_idx on public.ports (lower(name));
alter table public.ports enable row level security;
create policy "ports readable by signed-in users" on public.ports for select to authenticated using (true);
