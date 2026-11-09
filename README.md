# Coût de trajet (nom de travail : `cout-trajet`)

Site web qui calcule **combien coûte réellement un trajet en voiture** : carburant (prix moyen), péages, consommation du véhicule, vitesse moyenne, type de route. Comptes utilisateurs pour sauvegarder ses trajets, comparer des itinéraires (moins cher / plus rapide) et, plus tard, visualiser les routes sinueuses ou accidentogènes sur une carte interactive.

> Statut au 2026-11-09 : **phase de cadrage, aucun code**. Ces documents sont le point de départ ; chaque hypothèse non vérifiée est marquée ⚠️.

## Documents

| Fichier | Contenu |
|---|---|
| [docs/01-cadrage.md](docs/01-cadrage.md) | Problème, objectifs, périmètre, contraintes, hypothèses, questions ouvertes |
| [docs/02-fonctionnalites-et-mvp.md](docs/02-fonctionnalites-et-mvp.md) | Besoins fonctionnels (MoSCoW), définition du MVP, user stories, découpage en versions |
| [docs/03-architecture-et-stack.md](docs/03-architecture-et-stack.md) | Stack, architecture, sources de données externes, options comparées |
| [docs/04-donnees-et-calcul.md](docs/04-donnees-et-calcul.md) | Modèle de données Supabase, formule de coût, sinuosité / dangerosité |
| [docs/05-planning-risques.md](docs/05-planning-risques.md) | Spikes techniques, roadmap (Gantt), risques / pré-mortem, RGPD |
| [docs/decisions.md](docs/decisions.md) | Journal de décisions |

## En une phrase par choix structurant

- **Front** : Next.js + TypeScript + MapLibre, hébergé sur **Vercel**, domaine OVH relié par DNS (SEO possible via pages pré-générées).
- **Auth + BDD** : Supabase (Postgres + PostGIS + Auth + RLS).
- **API maison** (REST, Render) : proxy des services de routage/péage (clés secrètes), cache, jobs de mise à jour des prix.
- **Moteur de coût** : bibliothèque TypeScript pure, partagée front/API → recalcul instantané quand on change véhicule ou vitesse.
- **Point dur n°1 : les péages** (pas d'API gratuite évidente) → à trancher par un spike avant tout développement.
