-- Données de référence du calculateur de coût de trajet.
--
-- Confidentialité :
--  * vehicle_models et fuel_prices : données ouvertes (ADEME, data.economie.gouv.fr), lisibles par tous.
--  * toll_* et osm_toll_booths : réservées à l'API (rôle service). Elles compilent des grilles de
--    concessionnaires et des données OpenStreetMap (licence ODbL, partage à l'identique) : on ne les
--    expose pas telles quelles ; seules les valeurs calculées sont servies par l'API.
-- Toutes les tables ont la sécurité par ligne (RLS) activée.

-- Sources de tarifs (traçabilité et résolution des conflits : la plus récente, puis la plus fiable).
create table public.toll_sources (
  id             text primary key,
  label          text not null,
  effective_from date,
  reliability    text not null check (reliability in ('official', 'derived', 'third-party', 'estimate'))
);

-- Tarifs entre deux gares d'un même réseau, par classe de véhicule (€ TTC).
create table public.toll_pairs (
  from_gate   text not null,
  to_gate     text not null,
  concession  text not null,
  distance_km numeric(8, 2),
  price_c1    numeric(7, 2) not null,
  price_c2    numeric(7, 2) not null,
  price_c3    numeric(7, 2) not null,
  price_c4    numeric(7, 2) not null,
  price_c5    numeric(7, 2) not null,
  source_id   text references public.toll_sources (id),
  primary key (from_gate, to_gate)
);
create index toll_pairs_to_gate_idx on public.toll_pairs (to_gate);

-- Péages à tarif fixe : ouvrages (ponts, viaduc) et barrières à système ouvert.
create table public.toll_open (
  gate           text primary key,
  name           text not null,
  price_c1       numeric(7, 2) not null,
  price_c2       numeric(7, 2) not null,
  price_c3       numeric(7, 2) not null,
  price_c4       numeric(7, 2) not null,
  price_c5       numeric(7, 2) not null,
  seasons        jsonb not null default '[]'::jsonb,
  source         text not null,
  effective_from date not null
);

-- Gares de péage OpenStreetMap (© contributeurs OpenStreetMap, ODbL).
create table public.osm_toll_booths (
  osm_id   bigint primary key,
  name     text,
  operator text,
  lat      double precision not null,
  lon      double precision not null
);
create index osm_toll_booths_lat_lon_idx on public.osm_toll_booths (lat, lon);

-- Consommations des véhicules (ADEME « Car Labelling », cycle WLTP, L/100 km).
create table public.vehicle_models (
  key                text primary key,
  brand              text not null,
  model              text not null,
  label              text not null default '',
  description        text not null default '',
  fuel               text not null check (fuel in ('gasoline', 'diesel')),
  hybrid             boolean not null default false,
  gearbox            text,
  power_kw           numeric(6, 1),
  co2_mixed_g_per_km numeric(6, 1),
  price_eur          numeric(9, 2),
  l100_low           numeric(5, 2) not null,
  l100_medium        numeric(5, 2),
  l100_high          numeric(5, 2) not null,
  l100_extra_high    numeric(5, 2) not null,
  l100_mixed         numeric(5, 2)
);
create index vehicle_models_brand_idx on public.vehicle_models (brand, model);

-- Prix moyens des carburants (France entière : scope 'FR', ou code de département).
create table public.fuel_prices (
  day              date not null,
  scope            text not null,
  product          text not null check (product in ('gazole', 'e10', 'sp95', 'sp98', 'e85', 'gplc')),
  avg_eur_per_l    numeric(6, 3) not null,
  median_eur_per_l numeric(6, 3),
  stations         integer not null,
  primary key (day, scope, product)
);

-- Dates d'import des jeux de données (diagnostic).
create table public.reference_data_meta (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Sécurité par ligne.
alter table public.toll_sources        enable row level security;
alter table public.toll_pairs          enable row level security;
alter table public.toll_open           enable row level security;
alter table public.osm_toll_booths     enable row level security;
alter table public.vehicle_models      enable row level security;
alter table public.fuel_prices         enable row level security;
alter table public.reference_data_meta enable row level security;

-- Lecture publique des seules données ouvertes. Aucune politique d'écriture : seul le rôle service
-- (qui contourne la RLS) peut écrire ; les tables de péages n'ont aucune politique de lecture.
create policy "vehicle_models : lecture publique" on public.vehicle_models
  for select to anon, authenticated using (true);
create policy "fuel_prices : lecture publique" on public.fuel_prices
  for select to anon, authenticated using (true);
