-- Cache persistant des itinéraires : le quota gratuit du service de routage (≈ 200 requêtes par jour)
-- doit survivre aux redémarrages de l'API. Réservé au rôle service (RLS activée, aucune politique).
create table public.route_cache (
  key        text primary key,
  profile    text not null,
  response   jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index route_cache_expires_idx on public.route_cache (expires_at);
alter table public.route_cache enable row level security;
