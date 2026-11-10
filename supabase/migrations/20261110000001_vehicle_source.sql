-- Origine des consommations : « ademe-car-labelling » (mesurées par phase du cycle WLTP) ou
-- « eea-co2-monitoring » (consommation mixte seule ; le détail par phase est estimé).
alter table public.vehicle_models
  add column source text not null default 'ademe-car-labelling'
  check (source in ('ademe-car-labelling', 'eea-co2-monitoring'));
