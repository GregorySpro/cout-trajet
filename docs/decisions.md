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

## D-016 — 2026-11-09 — Routage de production (provisoire, voir docs/spikes/S2-routage-production.md)
- Choix : **OpenRouteService** en principal, **GraphHopper** puis **Geoapify** en secours, derrière une interface `RoutingProvider`, avec cache et quota-guard. Auto-hébergement exclu (budget 0 €), Mapbox exclu (carte bancaire), OSRM démo exclu (pas pour la production).
- À confirmer par un test avec clé : inscription sans carte, alternatives, `extra_info` (tollways, waytype, vitesse), longueur max.
- Revoir si : ORS exige un moyen de paiement ou ne propose pas les alternatives/`tollways` sur l'instance publique.
- **Mise à jour après test (2026-11-09)** : ORS fonctionne mais le quota observé est de **200 requêtes/24 h** (pas 2 000) ; les alternatives intégrées sont limitées à 100 km (on utilise défaut + `avoid tolls` = 2 appels par recherche) ; `tollways` marque les tronçons à péage sans donner prix ni gare. Le **cache** et le **multi-fournisseur** deviennent obligatoires dès le MVP.

## D-017 — 2026-11-09 — Camions, poids lourds et autres catégories de véhicules
- Choix : prendre en compte **plusieurs catégories** de véhicules dès la conception : voiture, utilitaire, camping-car, porteur, ensemble articulé, moto. Moteur de coût (v0.2.0) et module de péages déjà compatibles ; l'interface les expose à partir de V1 (MVP-0 reste centré sur la voiture).
- Ce qui est pris en compte : classe de péage 1 à 5 (classification officielle des concessionnaires, déduite de la hauteur, du PTAC et du nombre d'essieux) ; camions : consommation moyenne par défaut du CNR (porteur 19 t : 25,2 L/100 km ; articulé : 30,2 L/100 km, régional 2024), vitesse plafonnée à 90 km/h sur autoroute et 80 km/h sur route, pauses réglementaires de 45 min après 4 h 30 de conduite ; calcul hors taxes.
- Hypothèses à confirmer : limites de vitesse exactes (article R413-8), pauses (règlement 561/2006), ventilation ville/route/autoroute de la consommation des camions (×1,3 / ×1,0 / ×1,0), valeur 40 t plus récente que le CNR 2008 (34–35 L/100).
- À prévoir côté routage (P4) : profil poids lourd d'OpenRouteService (`driving-hgv`) avec les restrictions de hauteur/poids/essieux, à tester ; interdictions de circulation (week-end, jours fériés) non couvertes.
- Pas de base de véhicules lourds : consommation par défaut modifiable par l'utilisateur.
- Revoir si : le routage gratuit ne gère pas les restrictions des camions, ou si les péages des camions s'écartent des grilles (modulations, abonnements professionnels).

## D-018 — 2026-11-09 — Péages : prudence plutôt que précision apparente
- Constat : la détection par gares OpenStreetMap ne couvre pas les péages **en flux libre** (A13, A14, sortie 36 de l'A4, A79 : aucun portique dans OSM) ni les grilles AREA, SAPN et « systèmes ouverts » (non chargées) ; ~20 % des noms de gares restent sans correspondance.
- Choix : l'API **ne devine jamais** un péage. Elle distingue trois états : `complete` (tout est chiffré), `estimated` (prix par alias ou gare ambiguë, moyenne des candidates), `complete = false` (péage manquant ou non expliqué). Dans ce dernier cas la **comparaison avec l'itinéraire sans péage est désactivée** et le site doit afficher « péage non calculé ».
- Règles : correspondance automatique seulement dans le réseau de l'opérateur ; alias et ambiguïtés = prix estimé ; correspondances manuelles prioritaires et contrôlées par un prix de référence ; km « à péage » hors de la fenêtre des gares (marge 15 km, seuil 10 km) = incomplet.
- À faire pour étendre la couverture : charger AREA, SAPN et les barrières ouvertes (PDF à enregistrer par le porteur) ; positions des portiques en flux libre (non disponibles dans OSM) ; compléter la table de correspondance par axe, chaque ajout contrôlé par un prix.
- Revoir si : une source ouverte des portiques et de leurs tarifs apparaît (ex. open data des concessionnaires), ou si les ~20 % de noms non trouvés bloquent trop de trajets en pratique.

## D-019 — 2026-11-09 — Conflits entre sources de tarifs : la plus récente, puis la plus fiable
- Contexte : plusieurs documents peuvent donner un prix pour le même couple de gares (grilles de février, fichiers Vinci d'octobre, guide ASF de juin, sites d'ouvrages mis à jour le 1er mai…).
- Choix : chaque tarif porte sa **source** (date d'application ou de dernière mise à jour, fiabilité). En cas de prix différents : **la plus récente l'emporte** ; à date égale ou inconnue, **la plus fiable** (officiel > dérivé > site tiers > estimation) ; sinon la première chargée. Tout désaccord est journalisé (`conflicts`) et chaque péage affiché cite sa source (`provenance`).
- Raison : les tarifs bougent en cours d'année (ponts de Normandie le 1er mai, ASF le 1er juin, gratuité exceptionnelle de l'A14 le 16/11/2026) ; une date connue prime donc sur la fiabilité.
- Dates retenues : fichiers Vinci = date de dernière modification de leur serveur (14/10/2026) ; PDF = date d'application annoncée (01/02/2026).
- Revoir si : une source récente se révèle moins fiable qu'une ancienne (alors baisser sa fiabilité, pas contourner la règle), ou si les modulations tarifaires (heures creuses, jours fériés) imposent un modèle de tarif non unique par couple.

## D-020 — 2026-11-09 — Supabase : schéma, confidentialité des tarifs, chargement direct
- Contexte : l'API doit lire ses données de référence ailleurs que dans des fichiers locaux, et préparer comptes et trajets enregistrés.
- Choix : trois migrations SQL versionnées (`supabase/migrations`), appliquées par `pnpm --filter @cout-trajet/db run migrate` (suivi dans `schema_migrations`). **RLS activée sur toutes les tables.** Lecture publique uniquement pour `vehicle_models` et `fuel_prices` ; tarifs de péages, gares OSM et cache de routes réservés au serveur (rôle de service/connexion directe) ; tables utilisateur (profils, véhicules, trajets) en accès propriétaire seul via `(select auth.uid())`. Chargement par connexion Postgres directe (pooler IPv4), en une transaction, sans jamais vider véhicules ni prix carburant.
- Raison : les gares OSM sont sous licence ODbL et les grilles viennent de documents des concessionnaires ; les garder privées évite de redistribuer une base. Le pooler évite le problème d'IPv6 du plan gratuit.
- Revoir si : le projet gratuit est mis en pause pour inactivité (prévoir un appel périodique), ou si les limites de stockage gratuit sont atteintes.

## D-021 — 2026-11-10 — Véhicules manquants : compléter l'ADEME avec la base européenne (EEA)
- Contexte : le jeu ADEME ne contient que 594 versions utilisables (ni Kadjar, ni beaucoup de modèles vendus ces dix dernières années).
- Choix : importer les immatriculations françaises de la base européenne de surveillance du CO₂ (règlement 2019/631), regroupées par motorisation. Elle ne donne qu'une consommation mixte : le détail ville / route / autoroute est déduit par les rapports médians de l'ADEME et signalé comme estimé. L'ADEME reste prioritaire quand elle couvre le modèle.
- Raison : couverture bien plus large, gratuite, officielle ; l'estimation du détail est annoncée à l'utilisateur plutôt que présentée comme une mesure.
- Revoir si : une source donnant les consommations par phase pour tous les modèles devient disponible, ou si les doublons de noms entre sources gênent la recherche.

## À trancher (après spikes)
- D-006 : fournisseur de routage + méthode péages (S1/S2).
- D-007 : fournisseur de tuiles (S6).
- D-008 : plan Render (S8).
- D-009 : nom du projet et domaine.
