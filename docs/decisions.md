# Journal de décisions

Format : date — question — options — choix — raison — ce qui ferait revoir le choix.

## D-001 — 2026-11-09 — BDD et auth
- Choix : **Supabase** (imposé par le porteur). Région UE, RLS partout.
- Revoir si : limites du plan gratuit (mise en pause, quotas) bloquantes.

## D-002 — 2026-11-09 — API
- Choix : **API REST maison hébergée sur Render**, uniquement pour ce qui ne peut pas être dans le front (clés secrètes, cache, jobs).
- Revoir si : le routage retenu n'exige aucune clé secrète → Edge Functions Supabase suffisantes.

## D-003 — 2026-11-09 — Hébergement du front (révisé)
- Choix initial : OVH, site statique. **Remplacé** par la décision du porteur : **Vercel**, domaine OVH relié par DNS.
- Conséquence : framework front = **Next.js** (natif Vercel, SEO via pages pré-générées) au lieu de Vite SPA.
- Revoir si : usage commercial (plan Pro nécessaire) ou quotas gratuits insuffisants.

## D-004 — 2026-11-09 — Où s'exécute le calcul de coût
- Choix (proposé) : package TS pur exécuté **dans le navigateur** pour les curseurs, et côté API pour les jobs/tests.
- Raison : recalcul instantané, pas d'appels de routage supplémentaires.
- Revoir si : la formule devient confidentielle ou trop lourde.

## D-005 — 2026-11-09 — Découpage du MVP (proposé, à valider)
- Choix : MVP-0 calculateur anonyme → MVP-1 comptes/trajets → V2 sinueux/dangereux.
- Raison : le risque principal est la justesse du calcul (péages), pas l'authentification.

## D-010 — 2026-11-09 — Équipe, rythme, back
- Choix : projet **solo**, rythme libre sans heures planifiées ; back en **TypeScript / Node.js** (Fastify).

## D-011 — 2026-11-09 — Modèle économique
- Choix : **100 % gratuit**, aucune fonctionnalité payante ; pubs évitées (éventuellement en tout dernier recours).
- Conséquence : rester dans les quotas gratuits des API ; plan Hobby Vercel compatible tant que pas de pub.
- Revoir si : les coûts d'API dépassent le gratuit (limiter les fonctionnalités ou accepter un don/soutien volontaire, à discuter).

## D-012 — 2026-11-09 — Dépôt de code
- Choix : dossier `C:\dev\cout-trajet` (hors OneDrive), dépôt git local puis dépôt GitHub **public** : https://github.com/GregorySpro/cout-trajet
- Conséquence : jamais de secret dans le dépôt (clés API, `.env`) ; secrets uniquement dans Vercel / Render / Supabase.

## D-013 — 2026-11-09 — Budget
- Choix : **0 € strict**. Offres gratuites uniquement ; Render payant exclu (API avec mise en veille assumée).
- Revoir si : un service indispensable n'a aucune offre gratuite viable → réduire le périmètre plutôt que payer.

## D-014 — 2026-11-09 — Sources externes (provisoire, voir docs/spikes/S1-S2-apis-externes.md)
- Choix : APIs externes bienvenues tant qu'elles sont gratuites. Routage de base OpenRouteService ; péages HERE Toll Cost (quota ~1 250 calculs/mois) + barème maison en repli ; travaux/fermetures via flux DATEX II Bison Futé (réseau non concédé).
- Mécanismes : adaptateurs par fournisseur, cache, quota-guard (dégradation au lieu de dépassement payant).
- Revoir si : HERE exige une carte bancaire ou ne couvre pas la France, ou si les quotas se révèlent trop bas.

## D-015 — 2026-11-09 — HERE écarté
- Constat : l'inscription HERE exige une carte bancaire ou PayPal. Incompatible avec le budget **0 € strict** (D-013) : un moyen de paiement enregistré expose à une facturation en cas de dépassement.
- Choix : **ne pas utiliser HERE**. Les péages seront calculés par **barème par couple de gares** (APRR, Vinci, Sanef : données officielles) + détection des gares franchies par l'itinéraire (gares de péage OpenStreetMap, `barrier=toll_booth`, croisées avec la géométrie de l'itinéraire).
- Revoir si : un fournisseur de péages sans carte bancaire apparaît, ou si la détection des gares s'avère trop imprécise.

## À trancher (après spikes)
- D-006 : fournisseur de routage + méthode péages (S1/S2).
- D-007 : fournisseur de tuiles (S6).
- D-008 : plan Render (S8).
- D-009 : nom du projet et domaine.
