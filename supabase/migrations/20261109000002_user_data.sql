-- Données des utilisateurs : profil, garage de véhicules, trajets enregistrés.
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes (RLS). La suppression du compte
-- (auth.users) supprime tout en cascade (RGPD : droit à l'effacement).

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.user_vehicles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 60),
  category    text not null check (category in ('car', 'van', 'motorhome', 'hgv-rigid', 'hgv-articulated', 'motorcycle')),
  model_key   text references public.vehicle_models (key) on delete set null,
  -- Consommation saisie à la main {urban, rural, motorway?} en L/100 km.
  consumption jsonb,
  toll_class  smallint check (toll_class between 1 and 5),
  -- Dimensions {heightM, maxWeightT, axles} pour déduire la classe de péage et les restrictions des camions.
  dimensions  jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index user_vehicles_user_idx on public.user_vehicles (user_id);
-- Un seul véhicule par défaut par utilisateur.
create unique index user_vehicles_one_default_idx on public.user_vehicles (user_id) where is_default;

create table public.trips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  label           text not null check (char_length(label) between 1 and 120),
  -- {label, lon, lat} pour le départ et l'arrivée (adresses : données personnelles, voir RGPD).
  origin          jsonb not null,
  destination     jsonb not null,
  vehicle_id      uuid references public.user_vehicles (id) on delete set null,
  -- Paramètres de la requête /estimate, pour recalculer le trajet avec les prix du jour.
  request         jsonb not null,
  -- Dernier résultat (coût, durée, péages) pour comparer à l'enregistrement.
  snapshot        jsonb,
  saved_total_eur numeric(9, 2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index trips_user_created_idx on public.trips (user_id, created_at desc);

alter table public.profiles      enable row level security;
alter table public.user_vehicles enable row level security;
alter table public.trips         enable row level security;

-- auth.uid() est enveloppé dans un select : évalué une fois par requête et non par ligne.
create policy "profiles : lecture par le propriétaire" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles : modification par le propriétaire" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "user_vehicles : lecture par le propriétaire" on public.user_vehicles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_vehicles : création par le propriétaire" on public.user_vehicles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_vehicles : modification par le propriétaire" on public.user_vehicles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_vehicles : suppression par le propriétaire" on public.user_vehicles
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "trips : lecture par le propriétaire" on public.trips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "trips : création par le propriétaire" on public.trips
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "trips : modification par le propriétaire" on public.trips
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "trips : suppression par le propriétaire" on public.trips
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Un véhicule référencé par un trajet doit appartenir au même utilisateur.
create function public.check_trip_vehicle_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from public.user_vehicles v where v.id = new.vehicle_id and v.user_id = new.user_id
  ) then
    raise exception 'Le véhicule n''appartient pas à cet utilisateur';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trips_check_vehicle_owner
  before insert or update on public.trips
  for each row execute function public.check_trip_vehicle_owner();

-- Création automatique du profil à l'inscription.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- La fonction du déclencheur ne doit pas être appelable depuis l'API publique.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_trip_vehicle_owner() from public, anon, authenticated;
