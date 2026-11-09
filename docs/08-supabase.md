# 08 — Mise en place de Supabase

Budget : 0 €. Aucune carte bancaire ni PayPal ne doit être demandé : si c'est le cas, arrête-toi.

## Étapes (à faire par le porteur du projet)

1. Crée un compte sur supabase.com (connexion GitHub possible), puis un projet **gratuit** en région **UE** (ex. Paris ou Frankfurt). Choisis un mot de passe de base solide et garde-le.
2. Vérifie qu'aucun moyen de paiement n'est demandé (plan « Free »).
3. Bouton **Connect** du projet → onglet **Session pooler** (compatible IPv4) → copie la chaîne de connexion.
4. Dans `C:\dev\cout-trajet\.env`, ajoute la ligne `DATABASE_URL=...` (remplace `[YOUR-PASSWORD]` par le mot de passe). Ne la colle jamais dans le chat ni dans git.
5. Applique le schéma, puis charge les données :

```bash
pnpm --filter @cout-trajet/db run migrate
```

```bash
pnpm --filter @cout-trajet/db run load
```

6. Relance l'API : avec `DATABASE_URL` définie, elle lit la base ; sans, elle lit les fichiers locaux.

## Ce qui est en base

| Table | Accès public (clé anon) | Contenu |
| --- | --- | --- |
| `vehicle_models`, `fuel_prices` | lecture | modèles ADEME, prix carburant |
| `toll_*`, `osm_toll_booths`, `route_cache` | aucun | tarifs, gares (ODbL), cache |
| `profiles`, `user_vehicles`, `trips` | propriétaire seul | comptes et trajets enregistrés |

## Points à vérifier
- Les projets gratuits peuvent être mis en pause après une période d'inactivité (⚠️ à vérifier sur la page des tarifs Supabase) ; prévoir un appel régulier à `/health` plus tard.
- Option TLS stricte : télécharger le certificat racine du projet et renseigner `DATABASE_CA_PATH`. Sans lui, la connexion est chiffrée mais le certificat n'est pas vérifié.
- Le chargement remplace les tables de péages ; il ne touche ni véhicules ni prix carburant (mises à jour par upsert).
