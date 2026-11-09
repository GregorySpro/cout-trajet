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
