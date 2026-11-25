-- =====================================================================
-- Hyperion TMS · Supabase: общая база для офиса и водителей.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Можно запускать повторно: всё создаётся «если нет» или заменяется.
-- =====================================================================

-- ---------- Пользователи и роли ----------
-- office — диспетчеры и офис: видят и меняют всё.
-- driver — водитель: видит только работы, отправленные на его машину (truck).
-- none   — ждёт, пока офис выдаст роль.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  role       text not null default 'none' check (role in ('office', 'driver', 'none')),
  truck      text,                         -- для водителя: fleet number, напр. JEN0106
  created_at timestamptz not null default now()
);

-- Новый пользователь → профиль. Самый первый становится office, остальные ждут роль.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when exists (select 1 from public.profiles where role = 'office') then 'none' else 'office' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists hyperion_new_user on auth.users;
create trigger hyperion_new_user after insert on auth.users for each row execute function public.on_new_user();

-- Профили для пользователей, созданных до запуска этого файла
insert into public.profiles (id, email, role)
select u.id, u.email, 'none' from auth.users u on conflict (id) do nothing;
update public.profiles set role = 'office'
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'office');

create or replace function public.is_office() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'office');
$$;
create or replace function public.my_truck() returns text
language sql stable security definer set search_path = public as $$
  select truck from public.profiles where id = auth.uid() and role = 'driver';
$$;

-- ---------- Ордера ----------
-- Ордер целиком хранится как JSON (как в приложении): маршрут, план диспетчера, события водителя, файлы.
create table if not exists public.orders (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists orders_updated_idx on public.orders (updated_at desc);

-- Своя нумерация File Nr с 30000001 — общая для всех
create sequence if not exists public.file_nr_seq start 30000001;
create or replace function public.orders_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.data := jsonb_set(new.data, '{file_nr}', to_jsonb(nextval('public.file_nr_seq')::text));
  end if;
  new.data := jsonb_set(new.data, '{id}', to_jsonb(new.id));
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists orders_before on public.orders;
create trigger orders_before before insert or update on public.orders for each row execute function public.orders_before();

-- Видит ли текущий пользователь ордер: офис — все; водитель — если хоть одно плечо отправлено на его машину
create or replace function public.can_see_order(d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_office()
      or (public.my_truck() is not null and exists (
            select 1 from jsonb_each(coalesce(d -> 'plan', '{}'::jsonb)) p
            where p.value ->> 'sentTruck' = public.my_truck()));
$$;
create or replace function public.can_see_order_id(oid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.id = oid and public.can_see_order(o.data));
$$;

-- ---------- Изменения через функции (сервер склеивает, чтобы офис и водитель не затирали друг друга) ----------
-- Поля верхнего уровня, которые может менять водитель
create or replace function public.driver_keys_ok(patch jsonb) returns boolean
language sql immutable as $$
  select not exists (select 1 from jsonb_object_keys(coalesce(patch, '{}'::jsonb)) k
                     where k not in ('container_no', 'container_ok', 'ct', 'status', 'truck', 'legs', 'updated_at'));
$$;

-- Слить поля верхнего уровня: data || patch
create or replace function public.order_merge(oid text, patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  select data into d from public.orders where id = oid for update;
  if d is null then raise exception 'Order % not found', oid; end if;
  if not (public.is_office() or (public.can_see_order(d) and public.driver_keys_ok(patch))) then
    raise exception 'Not allowed';
  end if;
  update public.orders set data = d || patch where id = oid returning data into d;
  return d;
end $$;

-- План по плечу seq: слить ключи patch в plan[seq] (patch = null — снять плечо) + поля ордера top
create or replace function public.order_plan(oid text, seq text, patch jsonb, top jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; cur jsonb;
begin
  select data into d from public.orders where id = oid for update;
  if d is null then raise exception 'Order % not found', oid; end if;
  if not public.is_office() then
    -- водитель: только своё отправленное плечо и только статусы/события/файлы, без смены машины и отправки
    if public.my_truck() is null or coalesce(d -> 'plan' -> seq ->> 'sentTruck', '') <> public.my_truck()
       or patch is null or not public.driver_keys_ok(top)
       or exists (select 1 from jsonb_object_keys(patch) k
                  where k not in ('status', 'events', 'arrived', 'picked', 'issue', 'photos', 'ack')) then
      raise exception 'Not allowed';
    end if;
  end if;
  if not (d ? 'plan') or jsonb_typeof(d -> 'plan') <> 'object' then d := jsonb_set(d, '{plan}', '{}'::jsonb); end if;
  if patch is null then
    d := d #- array['plan', seq];
  else
    cur := coalesce(d -> 'plan' -> seq, '{}'::jsonb);
    d := jsonb_set(d, array['plan', seq], cur || patch);
  end if;
  update public.orders set data = d || coalesce(top, '{}'::jsonb) where id = oid returning data into d;
  return d;
end $$;

-- Файлы ордера (CMR, чек-листы, фото): добавить запись / убрать запись
create or replace function public.order_file_add(oid text, f jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  select data into d from public.orders where id = oid for update;
  if d is null then raise exception 'Order % not found', oid; end if;
  if not public.can_see_order(d) then raise exception 'Not allowed'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(d -> 'files', '[]'::jsonb)) x where x ->> 'id' = f ->> 'id') then return d; end if;   -- повтор той же отправки
  update public.orders set data = jsonb_set(d, '{files}', coalesce(d -> 'files', '[]'::jsonb) || jsonb_build_array(f)) where id = oid returning data into d;
  return d;
end $$;
create or replace function public.order_file_remove(oid text, fid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if not public.is_office() then raise exception 'Not allowed'; end if;
  select data into d from public.orders where id = oid for update;
  if d is null then raise exception 'Order % not found', oid; end if;
  update public.orders set data = jsonb_set(d, '{files}',
    coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(d -> 'files', '[]'::jsonb)) x where x ->> 'id' <> fid), '[]'::jsonb))
  where id = oid returning data into d;
  return d;
end $$;

-- ---------- Права (RLS) ----------
alter table public.profiles enable row level security;
alter table public.orders   enable row level security;

drop policy if exists "profiles: self or office read" on public.profiles;
create policy "profiles: self or office read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_office());
drop policy if exists "profiles: office edits" on public.profiles;
create policy "profiles: office edits" on public.profiles for update to authenticated
  using (public.is_office()) with check (public.is_office());

drop policy if exists "orders: read own" on public.orders;
create policy "orders: read own" on public.orders for select to authenticated using (public.can_see_order(data));
drop policy if exists "orders: office inserts" on public.orders;
create policy "orders: office inserts" on public.orders for insert to authenticated with check (public.is_office());
drop policy if exists "orders: office updates" on public.orders;
create policy "orders: office updates" on public.orders for update to authenticated using (public.is_office()) with check (public.is_office());
drop policy if exists "orders: office deletes" on public.orders;
create policy "orders: office deletes" on public.orders for delete to authenticated using (public.is_office());

grant execute on function public.order_merge(text, jsonb), public.order_plan(text, text, jsonb, jsonb),
  public.order_file_add(text, jsonb), public.order_file_remove(text, text), public.is_office(), public.my_truck() to authenticated;

-- ---------- Живые обновления (водитель закрыл работу — у диспетчера сразу видно) ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
end $$;

-- ---------- Хранилище файлов: CMR, чек-листы, фото ----------
-- Путь файла: orders/<id ордера>/<id файла>.jpg
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;

drop policy if exists "files: read if order visible" on storage.objects;
create policy "files: read if order visible" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (public.is_office() or public.can_see_order_id(split_part(name, '/', 2))));
drop policy if exists "files: upload if order visible" on storage.objects;
create policy "files: upload if order visible" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (public.is_office() or public.can_see_order_id(split_part(name, '/', 2))));
drop policy if exists "files: office deletes" on storage.objects;
create policy "files: office deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.is_office());
