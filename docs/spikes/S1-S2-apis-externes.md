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

## Sources consultées
- HERE : [tarifs](https://developer.here.com/pricing), [plans de base](https://developers.here.com/plans), [note sur les montants TTC](https://docs.here.com/here-kb/docs/routing-api-returns-toll-prices-including-taxes-how-can-i-get-net-toll-costs-or-tax-breakdown-details)
- TomTom : [tarifs](https://developer.tomtom.com/pricing)
- OpenRouteService : [plans](https://openrouteservice.org/plans/), [FAQ](https://giscience.github.io/openrouteservice/frequently-asked-questions)
- Événements routiers : [data.gouv.fr — réseau non concédé](https://www.data.gouv.fr/datasets/62558686864eeafd3af07eac), [état de circulation](https://www.data.gouv.fr/datasets/626113a9e7a3010e25422e7f), [Bison Futé](https://www.bison-fute.gouv.fr/donnees-sur-le-rrn.html)
- Tarifs de péage : [APRR sur data.gouv.fr](https://www.data.gouv.fr/datasets/tarifs-autoroutes-aprr)
- Vercel : [Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines)
