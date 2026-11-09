# Spike S1/S2 — APIs externes (péages, routage, travaux/fermetures)

Date : 2026-11-09. Recherche web uniquement (aucun téléchargement, aucune clé créée). Les chiffres viennent de résultats de recherche et **doivent être revérifiés sur les pages officielles avant de coder**. Contrainte : **budget 0 €**.

## Principe retenu
Plusieurs sources gratuites derrière des **adaptateurs** (`RoutingProvider`, `TollProvider`, `IncidentProvider`), avec **cache** et **quota-guard** côté API : quand un quota gratuit est épuisé, on dégrade (estimation au lieu de refuser, jamais de dépassement payant).

## Résultats

| Besoin | Source | Ce qu'on a trouvé | Verdict |
|---|---|---|---|
| Péages (coût) | **HERE Routing + Toll Cost** | Toll Cost gratuit jusqu'à 2 500 transactions/mois ; une route avec péages compte **2 transactions** → ~1 250 calculs/mois. Montants renvoyés TTC. Routage voiture gratuit jusqu'à ~30 000/mois. ⚠️ Anciennes sources parlent de 250 000 (obsolète ?). ⚠️ Carte bancaire requise ? France couverte ? À vérifier à l'inscription. | **Candidat n°1**, avec cache fort (clé = départ/arrivée arrondis + options). 1 250/mois est peu : insuffisant sans cache ni repli |
| Péages (repli) | **Barème maison** par concession | Tarifs réglementés ; jeu **APRR** sur data.gouv.fr (tarifs par couple entrée-sortie, colonnes `tarif_classe_X`). Autres concessions (Vinci, Sanef…) non trouvées en open data dans cette recherche. | **Repli indispensable** : construire une table €/km par concession + couples entrée-sortie quand disponibles. Jeu de données à contrôler |
| Péages (TomTom) | TomTom Routing | 2 500 requêtes/jour gratuites (partagées entre APIs), limite 5/s. **Rien ne confirme les coûts de péage** renvoyés par l'API (seulement un outil tiers). | À tester, pas à compter dessus |
| Routage | **OpenRouteService** | Gratuit : 2 000 directions/jour, 40/min. Évitement de péages possible (nom exact de l'option à vérifier). Aucun coût de péage. | **Candidat n°1 pour le routage de base** (alternatives, évitement péages) |
| Routage (autre) | HERE routing | ~30 000/mois gratuit | Option si ORS insuffisant |
| Travaux / événements — **réseau national non concédé** | Bison Futé + transport.data.gouv.fr, flux **DATEX II (XML)**, licence ouverte, **mise à jour horaire** (agrégé) | Travaux, fermetures, bouchons, déviations, événements dangereux | **Bon candidat, gratuit**. À parser (DATEX II) et filtrer le long de l'itinéraire avec PostGIS |
| Trafic (vitesse/débit) | Même source, **toutes les 6 min**, réseau non concédé | Utile pour la durée réelle, pas pour le MVP | V2 |
| Travaux / fermetures — **autoroutes concédées** | Non trouvé | Aucune API publique confirmée (Vinci/APRR/Sanef). Peut exister via le point d'accès national | **Trou à investiguer** ; sinon ne pas couvrir en MVP |
| Vitesse limite / type de route | OpenStreetMap (via le routage) | | OK |

## Conséquences sur la conception
1. **Péages = HERE (précis, quota serré) + barème maison (repli gratuit illimité).** L'utilisateur voit « péages estimés » ou « péages exacts » selon la source utilisée.
2. **Calcul de péage seulement à la demande** : routage de base via OpenRouteService, puis appel Toll Cost HERE uniquement pour l'itinéraire que l'utilisateur sélectionne, pas pour chaque alternative.
3. **Cache** : table `route_cache` (Supabase) avec TTL ; clé = origine/destination arrondies + options. Les tarifs de péage changent rarement (annuel).
4. **Quota-guard** : compteur par fournisseur dans la base ; au-delà de ~80 % du quota, bascule sur le barème maison / message « service très demandé ».
5. **Incidents** : job horaire sur Render (ou GitHub Actions cron, gratuit) qui télécharge le flux DATEX II, le convertit en GeoJSON et le range dans PostGIS ; l'API croise l'itinéraire avec les événements. Marquer clairement « réseau national hors autoroutes concédées ».
6. Les clés vont dans les variables d'environnement Render/Vercel, **jamais dans le dépôt public**.

## À faire pour clore le spike
- [ ] Relire les pages officielles : HERE (pricing, exigence carte bancaire, couverture France), OpenRouteService (quota, option d'évitement des péages), conditions du flux Bison Futé / transport.data.gouv.fr.
- [ ] Construire les 10 trajets de référence (S3) puis tester HERE et le barème sur ces trajets.
- [ ] Chercher les tarifs des autres concessionnaires (Vinci, Sanef, etc.) et les données travaux des autoroutes concédées.
- [ ] Vérifier les conditions Vercel Hobby (usage personnel / non commercial) : un site gratuit sans pub semble compatible, mais des témoignages de la communauté divergent sur les cas limites.

## Résultats des tests (2026-11-09)

### Test A — barème « au kilomètre » (repli) sur la grille officielle APRR
Méthode : 21 505 couples de gares de la grille APRR au 1/02/2026 (classe 1), prix comparé à `0,096 €/km × distance tarifaire`. Script local jetable (non versionné). Le calcul a été fait sur le texte extrait du PDF ; le parsing n'a pas été vérifié ligne par ligne.

| Tranche de distance | €/km médian |
|---|---|
| 0 – 20 km | 0,098 |
| 20 – 50 km | 0,096 |
| 50 – 100 km | 0,094 |
| 100 – 200 km | 0,094 |
| 200 – 400 km | 0,098 |
| 400 – 700 km | 0,121 (tranche suspecte, à investiguer : possible biais de parsing ou de majorations) |

Pour les trajets ≥ 50 km (20 875 couples) : **erreur médiane 11 %, 90e centile 28 %, seulement 48 % des couples à ±10 %.**

**Conclusion : un barème au kilomètre ne tient pas l'objectif de ±10 %.** Il ne doit servir que de repli, affiché comme « péage estimé » avec une fourchette. Le barème **par couple de gares** (APRR, Vinci…) est exact par construction ; son vrai défi est de connaître les gares franchies, donc de disposer d'un routage qui les expose (ou d'une table des gares géolocalisées).

### Test B — HERE Toll Cost : **abandonné (2026-11-09)**
L'inscription HERE exige une carte bancaire ou PayPal, incompatible avec le budget 0 € strict (voir D-015 dans `decisions.md`). Alternative à tester : détection des gares de péage sur l'itinéraire via OpenStreetMap + barème par couple de gares.

### Test B' — détection des gares de péage (OSRM + OpenStreetMap) sur Paris → Lyon ✅
Script : [`spikes/gates_test.py`](../../spikes/gates_test.py) (Python standard, sans clé). Services publics de démonstration (OSRM, Overpass), usage de test uniquement.

- **Itinéraire OSRM** Paris centre → Lyon centre : 465,9 km, 298 min, 8 611 points de géométrie.
- **Gares de péage OSM** dans la zone englobante : 267 ; 19 à moins de 150 m du tracé.
- Les gares trouvées le long du tracé, avec l'écart au tracé : **Fleury-en-Bière (0 m)**, Fontainebleau (63 m), Joigny (61 m), Chalon Nord (49 m), Chalon Sud (144 m), Villefranche Ville (93 m) et **Villefranche-Limas (0 m)**.
- **Constat :** les gares réellement franchies sur le tronc principal (Fleury-en-Bière en entrée, Villefranche-Limas en sortie) sont à **~0 m** du tracé, alors que les gares de bretelles (Joigny, Chalon…) sont à 49 m ou plus. Un seuil d'environ **25 m** isole les bonnes gares sur ce trajet. Ce seuil est une **hypothèse issue d'un seul trajet** à confirmer sur les autres (T02, T03, T04, T07, T09, T10).
- **Résultat :** la paire détectée (Fleury-en-Bière → Villefranche-Limas) est exactement celle de la grille APRR : **41,30 €**, soit la référence officielle de T01.
- **Limites :** (1) un seul trajet testé ; (2) les noms OSM (« Péage de Fleury-en-Bière ») devront être rapprochés des noms des grilles (« FLEURY-EN-BIERE ») ; (3) un tracé qui passe sur une bretelle de gare produira un seuil ambigu ; (4) les services publics de démonstration ne sont pas utilisables en production (il faudra un routage gratuit avec quota ou auto-hébergé).

### Test B'' — même méthode sur 5 autres trajets (2026-11-09)
Script : [`spikes/gates_batch.py`](../../spikes/gates_batch.py). T07 (Paris → Nice) non testé séparément : il se déduit de T01 + T03 + Aix/Nice (voir S3). Gares « franchies » = à ≤ 25 m du tracé ; au-delà = bretelle probable.

| Trajet | Itinéraire OSRM | Gares détectées à ≤ 25 m | Cohérence avec la référence officielle |
|---|---|---|---|
| T02 Paris → Lille | 219,8 km, 151 min | Survilliers-Saint-Witz (24 m ⚠️), Chamant (21 m), Senlis (0 m, même km que Chamant), Fresnes (0 m) | ⚠️ **Ambigu** : Fresnes ✅ (sortie du simulateur Sanef) ; Survilliers à 24 m est probablement une bretelle mais passe le seuil de 25 m |
| T03 Lyon → Marseille | 313,8 km, 206 min | Vienne (0 m), Lançon (0 m) ; bretelles à 27 – 149 m correctement exclues | ✅ Paire **Vienne → Lançon** = celle d'Ulys, **28,10 €** (référence Vinci) |
| T04 Bordeaux → Toulouse | 245,9 km, 161 min | Saint-Selve (0 m), Toulouse Nord (0 m) | ✅ Paire = celle d'Ulys (**22,20 €**). La référence Vinci à 22,90 € concerne « Toulouse nord-**est** » : **c'est la gare réellement empruntée qui fixe le prix** |
| T09 Clermont → Béziers | 341,1 km, 222 min | Viaduc de Millau (0 m) seul | ✅ Seul péage du trajet : 11,30 / 13,80 € selon la saison |
| T10 Caen → Le Havre | 96,0 km, 72 min | Pont de Normandie (0 m) seul | ✅ 6,10 €, aucune autre gare sur ce tracé |

**Conclusion intermédiaire.**
- La méthode retrouve les bonnes gares sur **4 trajets sur 5** (plus T01 déjà validé), sans clé, sans compte, sans quota.
- Les vraies gares franchies sont à **0 m** du tracé. Un seuil de **10 m** (plutôt que 25 m) donne le bon résultat sur les 6 trajets testés ; à 25 m, T02 contient un faux positif (Survilliers, 24 m). Seuil à confirmer sur davantage de trajets.
- **Points faibles :** (1) doublons (plusieurs nœuds OSM pour une même gare : Chamant / Senlis) ; (2) correspondance des noms OSM avec les noms des grilles (Toulouse Nord vs Toulouse nord-est, Chamant/Senlis) ; (3) le choix de l'itinéraire par OSRM peut emprunter une autre gare que celle de la référence ; (4) absence de contrôle sur les systèmes ouverts (barrières à tarif fixe).
- **Verdict provisoire :** approche **viable et 100 % gratuite**, à condition de construire une table de correspondance « gare OSM ↔ gare de la grille » (travail manuel/semi-automatique, une fois par concessionnaire).

### Test D — péage de bout en bout : ORS + gares OSM + grille officielle (2026-11-09)
Script : [`spikes/e2e_tolls.py`](../../spikes/e2e_tolls.py). Itinéraire OpenRouteService (clé locale), gares OpenStreetMap à ≤ 10 m du tracé, prix cherché dans la grille officielle APRR quand les gares sont APRR. Réponses mises en cache dans `data-sources/cache/` (ignoré par git).

| Trajet | Gares détectées sur le tracé ORS | Prix | Résultat |
|---|---|---|---|
| T01 Paris → Lyon | Fleury-en-Bière → Villefranche-Limas | **41,30 €** (grille APRR) | ✅ **Écart 0,0 %** vs référence officielle (41,30 €) : **chaîne complète validée** |
| T02 Paris → Lille | Senlis (= Chamant) → Fresnes | non calculé (Sanef : pas de grille par gares chargée) | ✅ gares cohérentes avec le simulateur Sanef (Paris → barrière de Fresnes) |
| T04 Bordeaux → Toulouse | Saint-Selve → Toulouse Nord | non calculé (ASF : grille par gares non chargée) | ✅ gares cohérentes avec Ulys (22,20 €) |
| T10 Caen → Le Havre | Pont de Normandie seul | 6,10 € (tarif à l'unité) | ✅ gare unique ; ⚠️ ORS marque aussi 2 tronçons « péage » sans gare détectée (voir ci-dessous) |
| T03 Lyon → Marseille | — | — | ⏳ Overpass en erreur (502/délai) ; déjà validé sur l'itinéraire OSRM (Vienne → Lançon) |
| T09 Clermont → Béziers | — | — | ⏳ idem ; déjà validé sur OSRM (viaduc de Millau seul) |

**Enseignements**
1. **La chaîne itinéraire → gares → prix est validée sur T01 avec 0 % d'écart.** C'est le premier résultat de bout en bout.
2. **La règle « gare à ≤ 10 m du tracé » fonctionne** sur les 4 trajets calculés. En revanche, **les extrémités des tronçons « péage » d'ORS ne donnent pas les gares** : le début du tronçon est à 4 – 5 km de la gare d'entrée (T01, T02, T04), alors que la fin tombe parfois sur la gare (Fresnes, Toulouse Nord). Il ne faut **pas** s'appuyer sur ces extrémités.
3. **T10** : 2 tronçons ORS « péage » (230 et 246 points) sans aucune gare OSM à moins de 4,7 km. Ces tronçons sont probablement des autoroutes marquées « payantes » dans OSM mais sans barrière sur le tracé ; **à investiguer** avant de conclure que le péage de T10 se limite au pont.
4. **Le maillon faible est la table des prix par gares** : seule APRR est exploitable aujourd'hui (grille PDF lue). Pour Sanef et Vinci il faut obtenir leurs grilles gare à gare (Vinci : fichiers .txt « tarifs internes » dont le lien est caché dans la page ; Sanef : brochures PDF « Tarifs 2026 »).
5. **Production : ne pas dépendre d'Overpass en direct.** Le service public a échoué à 3 reprises sur 4 trajets pendant ce test (502, délais dépassés). Il faut **exporter une fois** les gares de péage de France (quelques milliers de points) et les stocker dans Supabase/PostGIS ; la détection se fera alors en base, sans appel externe.
6. **Verdict provisoire go/no-go : GO conditionnel.** La méthode est prouvée et gratuite. Il reste à valider à plus grande échelle (le critère S1 était ≥ 8 trajets sur 10 à ±10 %) en chargeant les grilles Sanef et Vinci.

### Test C — routage OpenRouteService (itinéraire + gares) : **non réalisé**
Même condition : clé `ORS_API_KEY` à créer par toi. ORS ne donne pas de prix de péage ; on testerait l'itinéraire alternatif sans péage et les informations de voies à péage.

## Sources consultées
- HERE : [tarifs](https://developer.here.com/pricing), [plans de base](https://developers.here.com/plans), [note sur les montants TTC](https://docs.here.com/here-kb/docs/routing-api-returns-toll-prices-including-taxes-how-can-i-get-net-toll-costs-or-tax-breakdown-details)
- TomTom : [tarifs](https://developer.tomtom.com/pricing)
- OpenRouteService : [plans](https://openrouteservice.org/plans/), [FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)
- Événements routiers : [data.gouv.fr — réseau non concédé](https://www.data.gouv.fr/datasets/62558686864eeafd3af07eac), [état de circulation](https://www.data.gouv.fr/datasets/626113a9e7a3010e25422e7f), [Bison Futé](https://www.bison-fute.gouv.fr/donnees-sur-le-rrn.html)
- Tarifs de péage : [APRR sur data.gouv.fr](https://www.data.gouv.fr/datasets/tarifs-autoroutes-aprr)
- Vercel : [Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines)
