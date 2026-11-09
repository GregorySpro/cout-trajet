# Spike S2 — Routage de production (gratuit, avec quota)

Date : 2026-11-09. Recherche web uniquement. Contraintes : **0 € strict**, **aucune carte bancaire**, usage non commercial / sans pub. Les chiffres sont à revérifier sur les pages officielles avant de coder.

## Ce que le routage doit fournir (besoins du moteur de coût)
1. Géométrie complète de l'itinéraire (pour détecter les gares de péage).
2. 2 à 3 alternatives (plus rapide / évitant les péages).
3. Distance et durée par tronçon, avec le **type de route** (autoroute, nationale, ville) et si possible la **vitesse limite**.
4. Option « éviter les péages ».
5. Couverture France entière, quota gratuit suffisant, **sans moyen de paiement**.

## Candidats

| Fournisseur | Quota gratuit | Carte bancaire | Atouts | Doutes |
|---|---|---|---|---|
| **OpenRouteService (HeiGIT)** | 2 000 itinéraires/jour, 40/min (une page parle de 10 000/jour : à confirmer sur la page en ligne) | Inscription par e-mail annoncée sans carte (source tierce) ⚠️ | Données OSM ; `extra_info` dont **`tollways`** (segments à péage) ; évitement des péages ; politique « gratuit et le restera » | `waytype`/vitesses limites exposées par le service public ? alternatives disponibles ? longueur max des itinéraires alternatifs ? |
| **GraphHopper (offre gratuite)** | 500 crédits/jour (≈ 1 crédit par itinéraire), 5 points max | Annoncé sans carte (source tierce) ⚠️ | Qualité, alternatives (algorithme dédié) | **Usage non commercial uniquement** (acceptable : projet gratuit sans pub) ; quota plus petit |
| **Geoapify** | 3 000 crédits/jour, 5 requêtes/s | Page officielle : **pas de carte** | Quota confortable | « Usage commercial limité » ; alternatives et évitement des péages non confirmés |
| TomTom | 2 500 requêtes/jour (partagées entre APIs) | Annoncé sans carte pour le gratuit ⚠️ | Quota | Péages non confirmés (voir S1) |
| Mapbox | Large quota gratuit | **Carte exigée** (source tierce) | — | ❌ Exclu (budget 0 €) |
| OSRM démo / Valhalla public | Aucun engagement | Non | Pratique pour tester | ❌ **Pas pour la production** : serveur de démonstration, accès pouvant être retiré sans préavis, usage non commercial raisonnable, ~1 requête/s (source tierce) |
| Auto-hébergement (OSRM/Valhalla/GraphHopper) | Illimité | — | Contrôle total | ❌ Au budget 0 € : la France OSM demande plus de RAM que les offres gratuites (Render free = 512 Mo) et les clouds « toujours gratuits » exigent une carte |

## Recommandation
1. **Principal : OpenRouteService**, car il combine quota correct, absence de paiement annoncée et surtout l'information **`tollways`** par segment, très utile pour valider les gares détectées.
2. **Secours : GraphHopper** (alternatives, qualité) puis **Geoapify** (quota), tous derrière une interface `RoutingProvider` unique.
3. **Quota-guard + cache** (voir S1/S2) : cache par origine/destination arrondies et options ; compteur par fournisseur ; bascule automatique vers le secours à ~80 % du quota ; message clair au-delà.
4. **Un itinéraire en cache coûte 0 requête** : à 2 000 requêtes/jour et 50 % de cache, on couvre environ 4 000 recherches/jour, largement suffisant au lancement.

## Points à vérifier par un test avec une clé (étape suivante)
- [ ] Inscription sans carte bancaire confirmée à l'écran.
- [ ] `alternative_routes` : nombre d'alternatives, limite de longueur sur Paris → Nice ?
- [ ] `extra_info` : `tollways`, `waytype`, vitesse limite (`maxspeed` ?) disponibles sur l'instance publique ?
- [ ] Géométrie suffisamment fine pour la détection de gares à ≤ 10 m (voir S1).
- [ ] Temps de réponse et quota réellement décompté pour une requête avec alternatives.
- [ ] Conditions d'usage (attribution OSM/HeiGIT, interdiction éventuelle de mise en cache longue).

## Résultats du test OpenRouteService (2026-11-09)
Script : [`spikes/ors_test.py`](../../spikes/ors_test.py) (lit la clé dans `.env`, ne l'affiche jamais). 12 requêtes envoyées sur 5 trajets.

| Trajet | Rapide (défaut) | Part des points « à péage » | Option « éviter les péages » |
|---|---|---|---|
| T01 Paris → Lyon | 465,4 km, 273 min | 82 % | 485,7 km, **436 min** |
| T03 Lyon → Marseille | 313,7 km, 189 min | 72 % | 351,5 km, **382 min** |
| T04 Bordeaux → Toulouse | 243,8 km, 148 min | 76 % | 259,7 km, **258 min** |
| T09 Clermont → Béziers | 341,9 km, 204 min | **3 %** (le viaduc de Millau) | 348,0 km, 220 min |
| T10 Caen → Le Havre | 98,7 km, 72 min | 54 % ⚠️ | 127,7 km, 140 min (**avec un bac**) |

### Constats
1. **Ça fonctionne, sans carte bancaire à ma connaissance** (la clé a été créée par toi ; tu m'avais demandé de te signaler toute demande de carte, aucune n'a été signalée).
2. **Quota observé : 200 requêtes par 24 h** (en-tête `x-ratelimit-limit: 200`), et **non 2 000** comme annoncé sur les pages de présentation. Chaque requête compte, même celle qui échoue. À vérifier sur le tableau de bord HeiGIT. Conséquence : ~100 recherches/jour au maximum si une recherche = 2 appels (rapide + sans péage) → le **cache devient indispensable** et les **fournisseurs de secours** (GraphHopper 500/jour, Geoapify 3 000/jour) servent dès le début, pas seulement en dépannage.
3. **Les alternatives intégrées sont limitées à 100 km** : l'erreur 2004 est renvoyée dès Paris → Lyon (« distance approximative ≤ 100 000 m »). Pour les longs trajets, on obtient les deux itinéraires par **deux appels** : défaut + `avoid_features: tollways`. Un 3e itinéraire « équilibré » n'est pas disponible gratuitement.
4. **`tollways` découpe l'itinéraire en tronçons à péage / sans péage** (indices de points). Les extrémités du tronçon à péage donnent l'**entrée et la sortie d'autoroute** : c'est un candidat plus fiable que le seuil de 10 m pour trouver les gares OSM (à tester). Il ne donne **ni prix, ni nom de gare**.
5. **`waytype` n'est pas utile pour la vitesse** : ~99 % des points sont « 1 = route d'État », autoroutes comprises. Pour la vitesse par tronçon il faudra les étapes (`instructions`) ou un calcul distance/durée par segment (à tester).
6. **L'option « sans péage » peut doubler la durée** (T01 : 436 min contre 273 min) et peut inclure des **bacs** (T10 : waytype 9). Le moteur de coût doit le signaler (« itinéraire avec bac »).
7. ⚠️ **T10 à investiguer** : 54 % des points sont marqués « péage » alors que la détection OSM n'avait trouvé que le pont de Normandie. Le drapeau `tollways` peut couvrir des tronçons d'autoroute sans gare identifiée, donc **il ne suffit pas à lui seul à calculer un prix**.

### Mise à jour de la décision
ORS reste le routage principal **mais avec un quota réel bien plus faible que prévu** : le multi-fournisseur et le cache passent en priorité 1 dans l'architecture (voir D-016).

## Sources
[ORS plans](https://openrouteservice.org/plans/), [ORS extra info](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info), [ORS forum tollways](https://ask.openrouteservice.org/t/documentation-for-tollways-values-in-geojson-are-unclear/5106), [GraphHopper pricing](https://www.graphhopper.com/pricing/), [GraphHopper plans and rate limits](https://docs.graphhopper.com/openapi/section/plans-and-rate-limits), [Geoapify pricing](https://geoapify.com/pricing), [OSRM API usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/API%20Usage%20Policy)
