# 06 — Socle technique : ordre de priorité

Date : 2026-11-09. Principe : **traiter d'abord ce qui peut tout remettre en cause, puis ce qui porte la valeur, puis l'infrastructure, puis l'interface.** Sans dates (rythme libre). Outils présents sur la machine : Node 24, npm 11, pnpm 11, git 2.55.

## Ordre de priorité (une étape = quelque chose d'utilisable et testé)

| # | Étape | Pourquoi à cette place | Dépend de | Compte externe |
|---|---|---|---|---|
| **P0** | **Monorepo** pnpm : `packages/cost-engine`, `packages/shared`, `apps/api`, `apps/web` (vides), TypeScript strict, ESLint, Prettier, Vitest, CI GitHub Actions (lint + typecheck + tests) | Tout le reste s'appuie dessus ; une demi-journée | — | aucun (GitHub déjà là) |
| **P1** | **Moteur de coût** (`cost-engine`, TypeScript pur) : formule carburant (segments, vitesse, courbe en U), durée, total ; **tests sur les 10 trajets de référence** (S3) avec données figées | C'est le cœur de la valeur et le point où la précision se joue ; 100 % local, sans réseau, très testable | P0 | aucun |
| **P2** | **Données de péage** : scripts d'import des grilles (APRR PDF, Vinci CSV, Sanef PDF) vers des tables normalisées ; table `gares` (GPS) et **table de correspondance gare OSM ↔ grille** écrite à la main, avec tests (piège Senlis/Chamant) | Condition du go/no-go péages ; valide la chaîne gares → prix hors réseau | P0 (P1 utile pour les tests d'ensemble) | aucun |
| **P3** | **Spikes restants (rapides)** : S4 ADEME (consommations), S5 prix des carburants (flux officiel), export des gares de péage OSM (une fois, hors Overpass en direct) | Alimentent le moteur avec de vraies données ; petits, indépendants | — | aucun |
| **P4** | **API Fastify** : `/health`, `RoutingProvider` (ORS d'abord), **cache** + **quota-guard**, `POST /estimate` (itinéraire → gares → péages → coût) ; déploiement **Render** | Premier service bout en bout ; l'API protège les clés ; le quota (200/jour) impose le cache dès le début | P1, P2 | **Render** (à créer) |
| **P5** | **Supabase** : projet (région UE), migrations versionnées, tables de référence (véhicules, prix carburants, gares, grilles), RLS, jobs de mise à jour | Persistance du cache et des données de référence ; auth viendra après | P3, P4 | **Supabase** (à créer) |
| **P6** | **Front Next.js** (MVP-0) : formulaire départ/arrivée (API Adresse), carte MapLibre, résultat (carburant, péages, durée), curseur de vitesse (recalcul local avec `cost-engine`), 2 itinéraires (rapide / sans péage) | La partie visible ; on y arrive quand le calcul est fiable | P4 | fournisseur de tuiles (à choisir, S6) |
| **P7** | **Déploiement Vercel** + domaine OVH (CNAME/A) | Mise en ligne du MVP-0 | P6 | **Vercel** (à créer) |
| **P8** | **Comptes et trajets sauvegardés** (MVP-1) : Supabase Auth, RLS, CRUD trajets, véhicules | Après un calculateur public fiable | P5, P7 | — |

**Chemin critique** : P0 → P1 → P2 → P4 → P6 → P7. P3 s'insère n'importe où après P0 ; P5 peut démarrer dès que P4 expose ses premiers besoins de stockage.

## Ce que je peux faire seul / ce qui demande ton action

| Étape | Moi | Toi |
|---|---|---|
| P0, P1, P2, P3 | tout le code, les tests, la CI | valider les choix (nom du projet, structure) |
| P4 | code de l'API | créer le compte Render et connecter le dépôt GitHub ; renseigner les secrets (`ORS_API_KEY`) dans Render |
| P5 | migrations SQL, politiques RLS | créer le projet Supabase, me donner l'URL et la clé publique (jamais la clé `service_role` dans le chat) |
| P7 | configuration Next.js | créer le compte Vercel, ajouter le domaine, créer l'enregistrement DNS chez OVH |

## Avancement (2026-11-09)

| Étape | État |
|---|---|
| P0 Monorepo, CI | ✅ terminé, CI verte |
| P1 Moteur de coût | ✅ terminé (`packages/cost-engine`) ; hypothèses de consommation à calibrer |
| P2 Données de péage | 🟡 **cœur terminé** (`packages/tolls`) : lecture des grilles APRR, Vinci (ASF, Escota, Cofiroute) et Sanef ; livre de tarifs par couple de gares (34 711 couples en local) ; détection des gares franchies (≤ 10 m) ; correspondance gares OSM ↔ grilles ; calcul des péages d'un itinéraire ; péages à l'unité (Millau saisonnier, ponts de Normandie et Tancarville) |
| P3 Données de référence | 🟡 **code terminé** (`packages/reference-data`, voir [S4-S5](spikes/S4-S5-ademe-et-carburants.md)) : consommations ADEME importées (3 604 lignes → **594 versions** de véhicules distinctes), prix des carburants par agrégation serveur (national + 96 départements, relevé réel du 2026-11-09), prix moyen pondéré par département. **Reste** : chargement dans Supabase (P5) |
| Camions et autres catégories (D-017) | ✅ **moteur et péages prêts** : catégories (voiture, utilitaire, camping-car, porteur, articulé, moto), classe de péage déduite de la hauteur / PTAC / essieux, camions à 90 km/h avec consommation moyenne CNR et pauses de 45 min, coût hors taxes, péages classes 1 à 5 testés sur la grille APRR et les ouvrages. **Reste** : routage poids lourd (P4), interface (V1) |
| P2 (fin) | ⏳ reporté à plus tard : gares de frontière entre réseaux, table de correspondance des axes principaux |
| P4 API (Fastify) | 🟡 **P4a terminé : fonctionne en local sur de vrais trajets** (voir [07-api.md](07-api.md)) : `/estimate`, `/vehicles`, `/fuel-prices`, `/health` ; routage OpenRouteService (voiture et poids lourd) avec cache et garde de quota ; péages officiels ; alternative sans péage ; validation, limite de débit, CORS ; 241 tests. **Reste (P4b)** : déploiement Render (compte à créer), données de référence hors fichiers locaux (P5), durée plus réaliste |
| P5–P8 | à faire |

### Résultat P2 sur les trajets de référence (données réelles, local)
`pnpm --filter @cout-trajet/tolls run check-trips` : **6 trajets sur 6 à 0 % d'écart** (T01, T02, T03, T04, T09, T10) sur la chaîne complète itinéraire OpenRouteService → gares OSM → gares de grille → prix officiel.

⚠️ **Limites à garder en tête**
- **Validation en partie circulaire** : la table de correspondance des gares (`gate-mapping.ts`) a été écrite à partir de ces mêmes trajets. Le test valide la chaîne de code, pas encore la capacité à généraliser à des trajets inconnus. Il faut de nouveaux trajets de contrôle avant de conclure.
- **T04** : « Toulouse Nord » est ambiguë (Est 22,90 € / Ouest 22,20 €) ; la première gare est retenue avec un avertissement. L'écart de 0 % tient à ce choix.
- **Couverture des grilles** : APRR : 752 lignes ignorées (coupure entrée/sortie ambiguë, ~3,5 %) ; Sanef : sections A4/A26 non lisibles (mise en page du PDF) rejetées avec avertissement ; AREA, SAPN et Escota↔ASF (chaînage Paris → Nice) non chargés.
- Les grilles ne sont **pas versionnées** (documents tiers) : le livre de tarifs se régénère localement depuis `data-sources/`.
- Les gares OSM viennent d'Overpass en direct pour l'instant ; en production elles seront exportées une fois dans Supabase.

### Validation de P2 sur des trajets inconnus (2026-11-09)
Pour lever la réserve « validation circulaire », 5 trajets jamais utilisés pour écrire la table de correspondance ont été passés dans la chaîne (`pnpm --filter @cout-trajet/tolls run check-unseen`). Références indépendantes : PDF « principales liaisons » de Vinci. Les gares OSM viennent d'un **export national unique** (1 804 nœuds, `tools/export-osm-toll-booths.py`), ce qui supprime les appels Overpass par trajet (qui échouaient ou dépassaient 10 minutes sur les longs trajets).

| Trajet | Gares détectées (≤ 10 m) | Passe 1 (table des 6 trajets de référence) | Passe 2 (correspondance automatique + 2 ajouts) |
|---|---|---|---|
| U1 Paris → Orléans | Saint-Arnoult → Orléans Nord | aucune gare traduite | **12,00 €, 0 %** |
| U2 Paris → Tours | Saint-Arnoult → Monnaie | aucune | **26,00 €, 0 %** |
| U3 Paris → Nantes | Saint-Arnoult → Corzé-Angers → Ancenis | aucune | ❌ **non chiffré** (frontière de réseau à Corzé) |
| U4 Lyon → Montpellier | Vienne → Baillargues | 1 gare sur 2 | **32,80 €, 0 %** |
| U5 Montpellier → Toulouse | Saint-Jean-de-Védas → Toulouse Sud | aucune | ❌ **non chiffré** (2 gares sans correspondance) |

**Lecture des résultats**
- **La détection des gares généralise** : les 11 gares détectées sont de vraies barrières des autoroutes empruntées, sans fausse gare.
- **La correspondance est le goulot d'étranglement** : en passe 1, 1 gare sur 11 était traduite (celle déjà dans la table). La **traduction automatique par nom exact** (même réseau, nom identique après normalisation) a traduit 3 gares, **toutes confirmées par les prix** ; 2 correspondances non évidentes (Saint-Arnoult = « Paris (La Folie-Bessin) », Monnaie = « Tours centre (Monnaie) ») ont été contrôlées en recoupant 3 prix Vinci (12,00 € ; 26,00 € ; 32,90 €).
- **3 trajets sur 5 chiffrés, tous à 0 %**. Pour les 2 autres, **aucun prix faux n'est produit** : la chaîne signale la gare manquante et ne chiffre pas (comportement sûr, à relayer à l'utilisateur sous la forme « péage non calculé »).
- **Cas U3** : Paris → Nantes se calcule par addition de deux tronçons (Paris → Angers-Corzé 32,90 € + Angers → Nantes 10,40 € = 43,30 € dans le PDF Vinci), mais la gare de Corzé est une **frontière entre deux réseaux** (Cofiroute / ASF) et la grille Cofiroute n'a pas de couple Paris → Ancenis. Il faut modéliser les gares de frontière (une gare = sortie d'un réseau et entrée du suivant) et les péages en plusieurs tronçons.
- **Cas U5** : « Toulouse Sud » existe en Est et en Ouest ; « Saint-Jean-de-Védas » n'a pas de nom équivalent évident dans la grille ASF. Ces deux gares demandent une correspondance manuelle contrôlée.

**Conclusion** : la précision est au rendez-vous quand une correspondance existe (6 + 3 trajets à 0 %), mais la **couverture** ne l'est pas encore (3 trajets inconnus sur 5). Chaque nouvelle région demande des correspondances manuelles ; la traduction automatique par nom exact réduit le travail sans le supprimer. Priorités pour P2b : (1) gares de frontière entre réseaux, (2) table de correspondance couvrant les gares des axes principaux, (3) export des gares OSM dans Supabase.

### Fiabilisation des péages (2026-11-09, suite de P2)

**Ce qui a été ajouté** (`packages/tolls`, API) :
- **Correspondance automatique en trois niveaux** (`GateIndex`) : nom **exact**, nom **souple** (ponctuation, numéros de sortie, « Saint/St », « S/ » = « sur »), **alias** (texte entre parenthèses ou morceau d'un nom composé). Toujours dans le réseau de l'opérateur ; jamais de ressemblance floue.
- **Prix « estimé » plutôt que « officiel »** pour une correspondance par alias ou ambiguë (ex. Toulouse Nord Est/Ouest : moyenne des candidates, 22,55 € au lieu de 22,90 € ou 22,20 €) ; la réponse de l'API porte `tolls.estimated`.
- **Gares de frontière** (`sequence` + marqueur de rupture `GATE_BREAK`) : une gare compte comme sortie d'un sous-réseau et entrée du suivant (ex. Corzé / Angers sur Cofiroute).
- **Détection des péages non expliqués par des gares** : l'API compare les plages « à péage » du routage à la fenêtre couverte par les gares détectées (marge de 15 km) ; au-delà de 10 km hors fenêtre, `tolls.complete = false` et la comparaison avec l'itinéraire sans péage est désactivée.
- Deux correspondances manuelles de plus, contrôlées par les prix de Vinci : Saint-Jean-de-Védas = « Montpellier St-Jean » (27,60 €) ; Corzé-Angers (frontière).
- Camions : routes à accès restreint signalées (extra-info `roadaccessrestrictions` du profil poids lourd).

**Résultats**
| Vérification | Résultat |
|---|---|
| 6 trajets de référence | 6/6 dans les ±10 % (T04 : 22,55 € estimé pour une référence de 22,90 €) |
| 5 trajets inconnus | **5/5 chiffrés, 4/5 dans les ±10 %** (avant : 3 chiffrés) ; U5 Montpellier → Toulouse 27,90 € estimé (référence 27,60 €) ; U3 Paris → Nantes 38,10 € au lieu de 43,30 €, **signalé incomplet** (20 km à péage après la dernière gare détectée) |
| API, Paris → Nantes | péage 38,10 €, `complete: false`, comparaison désactivée (fail-safe) |
| API, Caen → Le Havre | `complete: false` (54 km à péage hors gares : flux libre A13/A14), comparaison désactivée |
| API, camion 6 m / 80 t (absurde) | itinéraire différent (584 km contre 474 km) : **les restrictions du profil poids lourd sont bien appliquées** |

**Couverture de la correspondance automatique** (`pnpm --filter @cout-trajet/tolls run coverage`, export national : 1 804 nœuds de gares, 1 475 nommés) :
| Réseau | Gares OSM nommées | Retrouvées dans les grilles | Non trouvées |
|---|---|---|---|
| APRR | 260 | 214 (82 %) | 46 |
| ASF | 414 | 334 (81 %, dont 8 ambiguës) | 80 |
| Cofiroute | 165 | 125 (76 %) | 40 |
| Escota | 121 | 99 (82 %) | 22 |
| Sanef | 208 | 100 (48 %) | 108 |
| **AREA** | 142 | **grille non chargée** | — |
| **SAPN** (A13, A14, A29…) | 22 | **grille non chargée** | — |
| Autres sociétés (ATMB, SFTRF, A'Lienor, Alis…) | 143 nommés + 328 sans nom | hors périmètre | — |
Un nœud « retrouvé » signifie qu'un nom de grille correspond ; cela ne prouve pas que la correspondance est juste (cas Senlis/Chamant).

### Extension des sources et règle de résolution des conflits (2026-11-09)

**Nouvelles sources chargées** : grille **AREA** (955 couples, PDF avec codes de gares), meilleure lecture de la grille **APRR** (21 486 couples au lieu de 20 753 : les mots coupés par l'extraction du PDF, comme « BESANCON ES T », sont recollés quand les deux gares sont connues par ailleurs). Livre de tarifs : **36 405 couples de gares**. Nouveau trajet inconnu validé : **Lyon → Annecy (APRR puis AREA) : 17,70 €, 0 %** (estimation Ulys 17,70 €).

**Règle « valeur la plus récente, puis la plus fiable »** (`TollBook`) : chaque tarif porte sa source (`id`, libellé, date d'application ou de dernière mise à jour, fiabilité `official` > `derived` > `third-party` > `estimate`). Pour un même couple de gares :
1. même prix → pas de conflit (on garde la source la plus récente pour la traçabilité) ;
2. prix différents → **la source la plus récente l'emporte** ; à date égale ou inconnue → **la plus fiable** ; sinon la première chargée ;
3. chaque désaccord est conservé dans `conflicts` (couple, valeurs, règle appliquée) et affiché à la construction du livre.
Les péages calculés citent leur source (`provenance`, ex. « Grille APRR au 01/02/2026 »). Les ouvrages à tarif fixe portent leur date (`effectiveFrom`) : le tarif des **ponts de Normandie du 1er mai 2026** l'emporte sur une grille de février. Dates retenues : grilles APRR/AREA/Sanef/SAPN au 01/02/2026 ; fichiers Vinci (ASF, Escota, Cofiroute) au **14/10/2026** (date de dernière modification de leur serveur, plus récente que les guides PDF de février et de juin 2026) : ils font foi.
Résultat du jour : **0 conflit** entre les sources chargées (aucun couple n'est donné par deux sources), la règle est prête pour les prochaines.

**Non chargé, avec la raison**
- **SAPN (A13, A14, A29)** : seulement 6 couples lus sur la grille ; sa mise en page est un tableau à plusieurs colonnes entrelacées (A29 Nord / A13-A29 Sud / A13) que l'extraction de texte ne restitue pas. Intérêt limité : l'A13 et l'A14 sont en flux libre (portiques absents d'OpenStreetMap).
**Barrières « systèmes ouverts » APRR/AREA — chargées** (accord donné) : le PDF ne contient que des images ; Pillow installé dans l'environnement isolé de pypdf, image extraite puis **lue visuellement** et saisie à la main (`open-barriers.ts`) : **20 barrières** (13 APRR dont le tunnel Maurice-Lemaire, 7 AREA), tarifs des classes 1 à 5 au 01/02/2026. Garde-fous : tests de relevé sur plusieurs lignes, cohérence des classes (5 ≤ 1 ≤ 2 ≤ 3 ≤ 4), identifiants uniques. Une barrière dont le nom est aussi celui d'une gare de grille (ex. Villefranche-Ville) est **écartée au profit de la grille** : un trajet qui sort à cette gare ne paie pas le forfait. ⚠️ Saisie manuelle, à revérifier si le document change.

**Couverture après extension** : AREA 133 gares nommées sur 142 retrouvées (94 %) ; APRR 236 sur 260 (91 %, contre 82 % avant les barrières ouvertes) ; les autres réseaux sont inchangés.

**Limites qui restent, par ordre d'importance**
1. **Péage en flux libre** : l'A13 (Paris–Normandie), l'A14 et la sortie 36 de l'A4 n'ont plus de barrières, remplacées par des portiques ([Sanef](https://www.autoroutes.sanef.com/fr/assistance/flux-libre/ou-se-situe-le-flux-libre)) ; l'A79 est aussi en flux libre. **OpenStreetMap ne répertorie aucun portique** (`highway=toll_gantry` : 0 nœud en France) : ces péages ne sont **pas détectables** par gares. L'API les signale (« km à péage hors des gares ») sans les chiffrer. Il faut les positions des portiques et les tarifs par tronçon (brochure SAPN).
2. **Grilles manquantes** : seule la grille SAPN (22 gares) reste quasi non chargée (6 couples sur une mise en page à colonnes entrelacées) ; AREA et les barrières « systèmes ouverts » APRR/AREA sont maintenant chargées.
3. **Noms non retrouvés** (environ 20 % des gares nommées) : à compléter à la main, en contrôlant chaque correspondance par un prix de référence.
4. **Gares sans nom** (18 % des nœuds) : ignorées.
5. **Sous-réseaux et barrières multiples** (Paris → Nantes) : une gare terminale non détectée fait sous-estimer le péage de ≈ 12 % ; signalé comme incomplet quand les plages à péage dépassent la dernière gare.

## Règles de travail
- **Petits commits**, un par sous-étape, poussés après ton accord.
- **Tests d'abord pour le moteur de coût** : les 10 trajets de référence sont les tests d'acceptation (écart ≤ 10 %).
- **Aucun secret dans le dépôt** (public) : `.env` local, variables d'environnement sur Render/Vercel/Supabase.
- **0 € strict** : vérifier avant chaque compte que l'inscription et l'offre gratuite n'exigent pas de carte (⚠️ à confirmer pour Render et Supabase).
- **Un nom de projet** est à choisir avant P7 (domaine / titre de la page).

## Points à confirmer avant de commencer
1. Nom du projet (pour les packages : `@cout-trajet/*` convient-il ?).
2. Ordre : je commence par **P0 puis P1** (monorepo puis moteur de coût) ?
3. Langue du code (identifiants en anglais, commentaires et docs en français) ?
