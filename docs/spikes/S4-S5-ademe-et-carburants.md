# Spikes S4 et S5 — Consommations ADEME et prix des carburants

Date : 2026-11-09. Lecture de l'API (petits échantillons et requêtes d'agrégation) ; code dans `packages/reference-data`.

## S4 — Consommations des véhicules (ADEME « Car Labelling »)

**Source** : API data-fair `https://data.ademe.fr/data-fair/api/v1/datasets/ademe-car-labelling/lines` (gratuite, sans clé). Jeu aussi publié sur [data.gouv.fr](https://www.data.gouv.fr/datasets/ademe-car-labelling) (mise à jour trimestrielle annoncée). **3 604 lignes** (versions de véhicules commercialisés en France).

**Contenu utile** : marque, modèle, description commerciale, énergie, boîte, puissance, cylindrée, prix, et **consommations WLTP par phase avec bornes min/max** : basse vitesse, moyenne vitesse, haute vitesse, très haute vitesse, mixte ; CO₂ mixte.

**Énergies présentes** : ESSENCE 1 514 ; GAZOLE 570 ; hybride non rechargeable gazole (`GAZ+ELEC HNR`) 561 ; hybride non rechargeable essence (`ESS+ELEC HNR`) 557 ; hybride rechargeable essence (`ELEC+ESSENC HR`) 174 ; ÉLECTRIQUE 134 ; SUPERÉTHANOL 67 ; essence + GPL 26 ; hybride rechargeable gazole 1. **Retenues pour le MVP : 3 202 lignes** (essence, gazole et leurs hybrides non rechargeables).

### Correspondance avec le moteur de coût (hypothèse à calibrer)
| Phase WLTP | Vitesse moyenne du cycle | Usage dans le moteur |
|---|---|---|
| Basse vitesse | ≈ 26 km/h | consommation **urbaine** |
| Haute vitesse | ≈ 78 km/h | consommation **route** (le moteur prend 80 km/h comme référence) |
| Très haute vitesse | ≈ 94 km/h (jusqu'à 131) | consommation **autoroute** (référence moteur : 110 km/h) |
| Cycle complet | — | consommation mixte (affichage) |

Avantage : la consommation autoroute est désormais **mesurée** par modèle, ce qui remplace l'hypothèse « extra-urbaine × 1,10 » pour tous les véhicules ADEME (elle reste le repli pour une consommation saisie à la main).
Les valeurs min/max (équipements différents) sont moyennées. ⚠️ Les valeurs WLTP sont des valeurs d'homologation : la consommation réelle est généralement plus élevée.

### Pièges relevés
- **Encodage cassé** dans certains champs (`220i Gran CoupÃ©`) : réparé à l'import.
- Une même version peut apparaître plusieurs fois (équipements) : dédoublonnage par clé.

## S5 — Prix des carburants

**Source** : jeu officiel « Prix des carburants en France – Flux instantané v2 » sur data.economie.gouv.fr (API Opendatasoft, **sans clé**, mise à jour toutes les 10 minutes selon la documentation du jeu). 9 828 stations le 2026-11-09.

**Découverte importante** : l'API calcule les **agrégats côté serveur** (`avg`, `median`, `count`, `group_by`). On obtient la moyenne nationale et les moyennes par département avec **2 petites requêtes**, sans télécharger les 9 828 stations.

**Relevé du 2026-11-09 (France entière, €/L)**
| Produit | Moyenne | Médiane | Stations |
|---|---|---|---|
| Gazole | 2,204 | 2,191 | 8 955 |
| E10 | 2,042 | 1,999 | 6 820 |
| SP95 | 2,113 | 2,099 | 2 687 |
| SP98 | 2,163 | 2,149 | 6 691 |
| E85 | 0,902 | 0,878 | 3 698 |
| GPLc | 1,078 | 1,072 | 1 491 |

96 départements couverts. Écart départemental sur le gazole : de 2,157 €/L (Loire-Atlantique) à 2,325 €/L (Paris), soit ≈ 8 % : la **pondération par département traversé** a un vrai effet sur un long trajet.

### Limites
- La moyenne inclut les stations d'autoroute (plus chères) : elle surestime légèrement le prix qu'on paie en choisissant sa station. À affiner (V1.2 : stations sur l'itinéraire).
- Quelques stations n'ont pas de département (4 sur 9 828) : ignorées.
- Un produit peut manquer dans un département (E10 en Corse) : repli sur la moyenne nationale.
- Fiabilité du service public : des pannes ponctuelles ont été signalées (certificat expiré en avril 2025) → la tâche quotidienne garde le **dernier relevé valide** si l'API échoue.

## Code livré (`packages/reference-data`)
- `ademe.ts` : normalisation, filtrage et dédoublonnage des lignes ADEME ; `toVehicleConsumption` pour le moteur de coût.
- `fuel-prices.ts` : requêtes d'agrégation, lecture des réponses, table de prix, `weightedFuelPrice` (moyenne pondérée par kilomètres et par département, repli national).
- `fetchers.ts` : récupération paginée (lien `next` refusé s'il sort de data.ademe.fr) et récupération des prix, avec `fetch` injectable pour les tests.
- Script `pnpm --filter @cout-trajet/reference-data run fetch-fuel` (2 requêtes, écrit dans `data-sources/generated/`, non versionné).
- 34 tests (extraits réels des API).

## Import complet réalisé (2026-11-09, avec accord)
`pnpm --filter @cout-trajet/reference-data run fetch-ademe` : **3 604 lignes reçues** → 3 202 éligibles (thermique et hybride non rechargeable) → **594 versions distinctes** après dédoublonnage (2 608 lignes strictement identiques sur les champs retenus : l'ADEME répertorie plusieurs lignes par version pour des variantes d'équipement). 149 modèles, 35 marques, 416 essence et 178 diesel, dont 201 hybrides non rechargeables. Consommation mixte WLTP : de 4,1 à 19,5 L/100 km, médiane 6,0. Aucune ligne au ratio autoroute/ville atypique. Fichier local `data-sources/generated/vehicles.json` (257 Ko, non versionné).

## Reste à faire
- [x] Import complet des véhicules ADEME : fait (voir ci-dessus).
- [ ] Charger véhicules, prix et gares dans Supabase (étape P5) et planifier la mise à jour quotidienne des prix (P4/P5).
- [ ] Calibrer la correspondance phases WLTP → types de route avec des relevés réels.
- [ ] Choisir quel produit proposer par défaut pour l'essence (E10 recommandé : le plus répandu).
