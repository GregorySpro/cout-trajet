# 07 — API REST (apps/api)

Fastify + TypeScript. Assemble itinéraire (OpenRouteService), gares et péages (`packages/tolls`), consommation et prix du carburant (`packages/reference-data`) et moteur de coût (`packages/cost-engine`). État au 2026-11-09 : **fonctionne en local sur de vrais trajets** (P4a) ; déploiement Render et stockage durable à venir.

## Lancer en local
```bash
pnpm install
pnpm --filter @cout-trajet/reference-data run fetch-fuel     # prix des carburants (2 requêtes)
pnpm --filter @cout-trajet/reference-data run fetch-ademe    # véhicules
pnpm --filter @cout-trajet/tolls run build-data              # livre de tarifs (grilles dans data-sources/)
pnpm --filter @cout-trajet/api run start                     # http://localhost:8787
```
Variables (voir `.env.example`) : `ORS_API_KEY` (obligatoire), `PORT`, `ALLOWED_ORIGINS` (origines CORS, séparées par des virgules), chemins des fichiers de données.

## Routes

| Route | Rôle |
|---|---|
| `GET /health` | État, version du moteur, quota restant du routage |
| `GET /fuel-prices` | Prix moyens nationaux des carburants (date du relevé, indicateur « périmé ») |
| `GET /vehicles?q=&limit=` | Recherche dans les 594 versions ADEME (marque, modèle, version) |
| `POST /estimate` | Coût d'un trajet : carburant, péages, durée, alternative sans péage |

### `POST /estimate`
```json
{
  "origin": { "lon": 2.3522, "lat": 48.8566 },
  "destination": { "lon": 4.8357, "lat": 45.764 },
  "waypoints": [{ "lon": 3.087, "lat": 45.7772 }],
  "vehicle": { "category": "car", "vehicleKey": "<clé de GET /vehicles>" },
  "fuel": { "product": "e10" },
  "speeds": { "motorwayKmh": 110 },
  "date": "2026-11-09",
  "excludeVat": false,
  "alternatives": true,
  "includeGeometry": true
}
```
- **Escales** : `waypoints` (facultatif, 5 au plus, dans l'ordre de passage). Elles ne coûtent pas de requête de routage en plus : le trajet reste un seul appel, avec et sans péage.
- **Véhicule** : `category` (`car`, `van`, `motorhome`, `hgv-rigid`, `hgv-articulated`, `motorcycle`), puis soit `vehicleKey` (ADEME), soit `consumption` `{urban, rural, motorway?}` en L/100 km. Pour un camion, tout est facultatif (moyenne CNR par défaut). `dimensions` `{heightM, maxWeightT, axles}` déduisent la classe de péage et, pour un camion, les restrictions envoyées au routage ; `tollClass` force la classe.
- **Carburant** : `fuel.product` (`gazole`, `e10`, `sp95`, `sp98`, `e85`, `gplc`) → prix moyen national, ou `fuel.priceEurPerL` pour imposer un prix. Par défaut : E10 pour un véhicule ADEME à essence, gazole pour un diesel ou un camion.
- **Réponse** : `routes` (jusqu'à 2 : `fastest` et `noToll`) avec distance, durée, carburant, péages (gares, tarifs officiels), total, fourchette, tracé simplifié, avertissements ; `comparison` (surcoût, minutes gagnées, coût de l'heure gagnée) ; `fuelPrice` ; `vehicle` ; `warnings`.
- Erreurs : 400 (requête invalide, détail des champs), 404 (véhicule inconnu), 422 (aucun itinéraire), 429 (trop de requêtes), 502 (routage indisponible), 503 + `Retry-After` (quota de routage presque épuisé).

## Comment c'est calculé
1. **Itinéraire** : OpenRouteService (`driving-car` ou `driving-hgv` avec hauteur/poids pour les camions), `extra_info` `waycategory`, `waytype`, `tollways`.
2. **Segmentation** : autoroute si l'extra-info « Highway » est présente ; sinon ville (< 40 km/h de moyenne sur le pas de guidage) ou route.
3. **Péages** : gares OSM à ≤ 10 m du tracé → gares de grille (table manuelle + nom exact) → prix officiel de la classe du véhicule.
4. **Coût** : moteur de coût (consommation ADEME, vitesse, prix du carburant, pauses des camions, hors taxes).
5. **Alternative sans péage** : demandée seulement si le tracé rapide a des péages (économie de quota) et refusée si la réserve de quota est entamée.

## Protections
- Validation stricte (zod) ; France métropolitaine seulement ; corps limité à 16 Ko.
- Limite de débit par client (20 `/estimate` par minute, 60 requêtes au total).
- CORS limité aux origines configurées ; aucune clé dans les réponses ; erreurs internes sans détail.
- Cache des itinéraires 6 h (clé : points arrondis à 11 m, profil, option sans péage) ; garde de quota (réserve de 20 requêtes pour les appels essentiels) ; prix des carburants rafraîchis toutes les 6 h, dernier relevé valide conservé en cas de panne.

## Résultats sur de vrais trajets (local, 2026-11-09)
| Trajet | Résultat |
|---|---|
| Paris → Lyon, voiture ADEME (Kangoo) | 465 km, péage **41,30 €** (gares Fleury → Limas), total 130,68 € ; alternative sans péage 70,72 € (+59,96 € pour gagner 125 min) ; 2e appel en **118 ms** (cache) |
| Paris → Lyon, articulé 40 t, hors taxes | profil camion accepté (474 km), classe 4, péage **115,92 € HT** (= 139,10 € TTC / 1,2, grille APRR), pauses 45 min |
| Caen → Le Havre | pont de Normandie 6,10 € mais **54 km à péage hors des gares** (A13 en flux libre, sans barrière) → `complete: false`, comparaison désactivée ; l'alternative traverse un bac (signalé) |
| Montpellier → Toulouse | péage **27,90 € estimé** (`estimated: true`, gare « Toulouse Sud » ambiguë Est/Ouest ; référence Vinci 27,60 €) |
| Paris → Nantes | péage 38,10 € mais **20 km à péage après la dernière gare** → `complete: false`, comparaison désactivée (référence Vinci 43,30 €) |
| Paris → Lyon, articulé 6 m / 80 t (valeurs absurdes) | le routage poids lourd contourne les restrictions : 584 km contre 474 km |

## Limites connues
- **Péage incomplet ou estimé** : `tolls.complete = false` quand un péage n'a pas pu être chiffré en entier (gare sans correspondance, couple sans tarif, km à péage hors des gares comme sur l'A13/A14 en flux libre) ; `tolls.estimated = true` quand un prix repose sur un alias ou une gare ambiguë. **Le site ne doit jamais afficher un total incomplet comme définitif** (afficher « péage non calculé » ou une fourchette) ; la comparaison avec l'itinéraire sans péage est alors désactivée. Voir « Fiabilisation des péages » dans [06-socle-technique.md](06-socle-technique.md) pour la couverture.
- **Durée** : le moteur applique les vitesses choisies (130 km/h par défaut sur autoroute) sans connaître les limites réelles ni la circulation ; il est **plus optimiste** que le routage (ex. 233 min contre 273 min pour Paris → Lyon). Les deux durées sont renvoyées. À calibrer : vitesse par défaut plus réaliste, ou durée du routage comme base.
- **Prix du carburant** : moyenne nationale ; la pondération par département traversé existe dans `reference-data` mais n'est pas encore branchée (il faut identifier les départements du tracé).
- **Données de référence en fichiers locaux** (livre de tarifs, gares, véhicules) : non versionnées, à charger dans Supabase (P5) avant le déploiement.
- Quota gratuit d'OpenRouteService : 200 requêtes par 24 h ; ≈ 2 par recherche sans cache.
- Restrictions de camions (hauteur, poids) transmises au routage : acceptées par l'offre gratuite, mais leur effet réel sur les itinéraires n'est pas encore vérifié.
- Interdictions de circulation des camions (week-end, jours fériés), trafic, bacs payants : non couverts.
