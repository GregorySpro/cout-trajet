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
| P3 Données de référence | 🟡 **code terminé** (`packages/reference-data`, voir [S4-S5](spikes/S4-S5-ademe-et-carburants.md)) : consommations ADEME (3 202 lignes éligibles sur 3 604), prix des carburants par agrégation serveur (national + 96 départements, relevé réel du 2026-11-09), prix moyen pondéré par département. **Reste** : import complet des véhicules (accord de téléchargement), chargement dans Supabase (P5) |
| P2 (fin) | ⏳ reporté à plus tard : gares de frontière entre réseaux, table de correspondance des axes principaux |
| P4–P8 | à faire |

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
