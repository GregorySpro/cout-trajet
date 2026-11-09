# Spike S3 — Trajets de référence (proposition à valider)

Un **trajet de référence** est un trajet réel dont on connaît le coût (péage, conso, distance, durée). Il sert à mesurer l'erreur de notre calcul (objectif ≤ 10 %) et deviendra un jeu de tests automatiques.

> Les colonnes « à relever » sont **vides volontairement** : aucun prix n'est inventé. Chaque valeur sera relevée sur une source officielle (site du concessionnaire, autoroutes.fr, relevé de télépéage) et sourcée.

## Les 10 trajets proposés

| # | Trajet | Ce que ça teste | Péage attendu | Variante à tester |
|---|---|---|---|---|
| 1 | Paris → Lyon | Long trajet autoroutier, une seule grande concession | Oui | Sans péage (nationales) |
| 2 | Paris → Lille | Autoroute dense, autre concessionnaire | Oui | Sans péage |
| 3 | Lyon → Marseille | Autoroute à fort trafic, zone urbaine aux extrémités | Oui | Sans péage |
| 4 | Bordeaux → Toulouse | Alternative gratuite crédible mais plus longue | Oui | Sans péage |
| 5 | Rennes → Nantes | **Zéro péage** : voie express gratuite (le calcul ne doit rien inventer) | Non | — |
| 6 | Grenoble → Briançon | Route de montagne, sinueuse, vitesse réelle basse, sans péage (utile pour la V2 sinuosité) | Non | — |
| 7 | Paris → Nice | **Multi-concessions** sur très longue distance (cumul de péages) | Oui | Sans péage |
| 8 | Toulouse centre → aéroport de Toulouse-Blagnac | **Urbain** : conso ville, vitesse faible | Non | — |
| 9 | Clermont-Ferrand → Béziers | Autoroute gratuite avec **un seul péage ponctuel** (viaduc de Millau) | Oui (ouvrage) | — |
| 10 | Caen → Le Havre | Péage lié à un **pont** | Oui (pont) | Sans péage (autre franchissement) |

Couverture : long autoroutier (1,2,3,7), alternative gratuite (1,2,3,4,7,10), zéro péage (5,6,8), ouvrage à péage (9,10), montagne (6), urbain (8), multi-concessions (7).

## Fiche à remplir par trajet

```
id: T01
départ: Paris (adresse précise)      arrivée: Lyon (adresse précise)
itinéraire de référence: autoroute (A6) / variante: sans péage
distance_km:            (source: ...)
durée_min:              (source: ...)
péage_classe1_eur:      (source + date du relevé)
carburant: essence/diesel    conso_réelle_l100: (facultatif, véhicule: ...)
prix_litre_jour:        (source + date)
notes:
```

À stocker ensuite dans `data/reference-trips.json` (versionné), avec une date de relevé : les tarifs de péage changent chaque année (revalorisation en début d'année ⚠️ à vérifier).

## Méthode de relevé
1. **Péages** : site officiel du concessionnaire ou simulateur de l'ASFA (autoroutes.fr ⚠️ à vérifier), classe 1 (voiture). Noter le détail par concession pour T07.
2. **Distance/durée** : un service de routage de référence, noté avec la date ; ne pas s'en servir pour valider le routage lui-même (même source = pas de contrôle).
3. **Consommation réelle** : uniquement si tu as des relevés de plein pour ta voiture ; sinon on utilise la conso ADEME du modèle et on teste surtout les péages et la distance.
4. **Critère de réussite (S1/S2)** : écart de péage ≤ 10 % sur ≥ 8 trajets à péage sur 10 ; pour T05, T06, T08 le péage calculé doit valoir exactement 0.

## Premier relevé (2026-11-09) — **non officiel, à confirmer**

Source : recherche web. Les valeurs viennent de comparateurs et de guides, pas des grilles des concessionnaires. **Aucune n'est utilisable comme référence de test en l'état.** Tarifs 2026 en vigueur depuis le 1er février 2026 (hausse moyenne ~0,86 %).

| # | Trajet | Péage classe 1 relevé (fourchette) | Distance citée | Fiabilité | Remarques |
|---|---|---|---|---|---|
| T01 | Paris → Lyon | **35,80 – 41,28 €** (41,25 / 41,28 les plus cités ; 36,70 ; 35,80) | 445 – 465 km | ❌ écart > 10 % entre sources | Écart sans doute dû aux points d'entrée/sortie |
| T02 | Paris → Lille | **≈ 18,90 – 19 €** (16,90 et 27,10 jugés aberrants) | — | ⚠️ cohérent mais non officiel | Sanef (A1) |
| T03 | Lyon → Marseille | **28,10 – 28,20 €** (Ulys, fuel-prices.eu) ; autres sites 35,75 – 37,30 € | ~310 km | ⚠️ deux sources concordent | Vinci/ASF (A7) |
| T04 | Bordeaux → Toulouse | **22,90 €** (tarif Vinci en vigueur au 1/2/2026, selon un site) ; 22,20 € (Ulys) | — | ⚠️ cohérent | Vinci/ASF (A62) |
| T05 | Rennes → Nantes | **0 €** (voie express gratuite) | — | ⚠️ à vérifier sur l'itinéraire | Non recherché sur le web |
| T06 | Grenoble → Briançon | **0 €** (routes nationales) | — | ⚠️ à vérifier sur l'itinéraire | Non recherché sur le web |
| T07 | Paris → Nice | **90,60 €** (Ulys, 933 km) ; 78,50 € ; ~84 € | 933 km | ❌ écart > 10 % | Plusieurs concessions : détail par concession à obtenir |
| T08 | Toulouse centre → aéroport | **0 €** (urbain) | — | ⚠️ à vérifier | Non recherché sur le web |
| T09 | Clermont-Ferrand → Béziers | **≈ 11,30 € hors été / 13,80 € été** (viaduc de Millau seul) | — | ❌ non confirmé (arrêté tarifaire 2026 existe, grille non lue) | Source officielle : Compagnie Eiffage du Viaduc de Millau |
| T10 | Caen → Le Havre | Pont de Normandie : **5,90 – 6,10 €** (hausse de 20 c en 2026 selon une réponse ministérielle) | — | ❌ écart de 20 c, non confirmé | Autres sections à péage éventuelles (autoroutes) non vérifiées. Source officielle : pontsnormandietancarville.fr |

### Ce que ça nous apprend
- **Les sources tierces se contredisent déjà de plus de 10 %** (T01, T07). Il faut des valeurs issues du **simulateur officiel du concessionnaire** (Sanef, Vinci/ASF, APRR, Ulys, Eiffage…), saisies avec les gares d'entrée et de sortie précises.
- **Le coût dépend des gares exactes** : notre outil devra savoir à quelles gares on entre et on sort, pas seulement la distance.
- Comme les prix tournent autour de 0,09 – 0,115 €/km en classe 1, un barème « au km » sera vite à plus ou moins 10 %. Il restera un repli, pas une référence.
- Les simulateurs officiels sont des pages dynamiques : le relevé fiable demande de les interroger dans un navigateur (lecture seule, pas de téléchargement).

### Sources consultées
[Ulys](https://ulys.com/prix-du-peage/paris-nice/), [Sanef A1](https://www.autoroutes.sanef.com/fr/mon-voyage/peage-autoroute-a1), [mondial.paris](https://mondial.paris/?p=53179), [fuel-prices.eu](https://www.fuel-prices.eu/tolls/france/), [Pont de Normandie (fuel-prices.eu)](https://www.fuel-prices.eu/tolls/france/pont-de-normandie/), [Viaduc de Millau (webzine.voyage)](https://webzine.voyage/autoroutes/tarifs-peages/tarif-viaduc-de-millau/), [Selectra (A62)](https://selectra.info/energie/actualites/marche/a69-peage-17-euros-aller-retour-baisse-33-pct), [distanceenvoiture.fr](https://distanceenvoiture.fr/fr/itineraire/Paris/Nice)

## Relevé sur les sites des concessionnaires (2026-11-09, navigateur, lecture seule)

| # | Source | Valeur relevée (classe 1) | Statut |
|---|---|---|---|
| T09 | [Viaduc de Millau — tarifs au 1/02/2026](https://www.leviaducdemillau.com/accueil-viaduc-de-millau/tarifs-du-peage.html) (site du concessionnaire) | **11,30 €** du 16/09 au 14/06 ; **13,80 €** du 15/06 au 15/09 | ✅ **Officiel** |
| T10 | [Ponts de Normandie et Tancarville — tarifs à partir du 1/05/2026](https://www.pontsnormandietancarville.fr/les-tarifs/) | Pont de Normandie **6,10 €** ; pont de Tancarville 2,90 € | ✅ **Officiel** (pont seul ; autoroutes d'accès non vérifiées) |
| T01 | [Ulys Paris–Lyon](https://ulys.com/prix-du-peage/paris-lyon/) (marque Vinci) | **41,30 €**, 464 km, entrée Fleury-en-Bière → sortie Villefranche-Limas, « hors modulations » | ⚠️ Estimation ; la **même page** affiche aussi 35,80 € dans un texte ancien |
| T03 | [Ulys Lyon–Marseille](https://ulys.com/prix-du-peage/lyon-marseille/) | **28,10 €**, 315 km, Vienne → Lançon | ⚠️ Estimation |
| T04 | [Ulys Bordeaux–Toulouse](https://ulys.com/prix-du-peage/bordeaux-toulouse/) | **22,20 €**, sortie Toulouse-Nord/Ouest | ⚠️ Estimation |
| T07 | [Ulys Paris–Nice](https://ulys.com/prix-du-peage/paris-nice/) | **90,60 €** (affichage principal) | ⚠️ Estimation ; la page mélange 90,60 et 41,30 |
| T02 | [Ulys Lille–Paris](https://ulys.com/prix-du-peage/lille-paris/) | **18,90 €**, Dourges → Roissy CDG | ⚠️ Estimation (réseau Sanef) ; texte ancien sur la même page : 16,90 € |
| T02 | [Simulateur Sanef](https://www.autoroutes.sanef.com/fr/tarifs-peage), véhicule léger, A1, entrée « Paris / Roissy CDG » → sortie « Barrière de Fresnes (Lille) », interrogé le 2026-11-09 | **18,90 €** | ✅ **Officiel** (tarifs au 1/02/2026) ; confirme l'estimation Ulys. Valable pour ce couple de gares uniquement |
| T01 | **Grille officielle APRR** « Tarifs de péage en euros TTC en vigueur au 1er février 2026 » (PDF de 300 pages, lu le 2026-11-09) | Gare d'entrée **FLEURY-EN-BIERE** → gare de sortie **VILLEFRANCHE-LIMAS** : distance tarifaire 430,28 km, **classe 1 = 41,30 €** (classe 2 : 64,30 €) | ✅ **Officiel**. Confirme Ulys (41,30 €) et contredit le texte ancien « 35,80 € » |
| T03, T04, T07 (+ les portions Vinci de T01 à T07) | Vinci Autoroutes (ASF/Cofiroute/Escota) | Le site Vinci Autoroutes renvoie vers Ulys pour les prix ; APRR (A6) non encore interrogé. Les brochures tarifaires officielles sont des **PDF** (téléchargement = à valider avec toi) | ⏳ Non officiel pour l'instant. **APRR n'a pas de simulateur** : seulement des grilles PDF au 1/02/2026 ([APRR](https://voyage.aprr.fr/sites/default/files/2026-02/TARIFS_APRR.pdf), [AREA](https://voyage.aprr.fr/sites/default/files/2026-02/TARIFS_AREA.pdf), [systèmes ouverts](https://voyage.aprr.fr/sites/default/files/2026-02/2026-%20Syst%C3%A8mes%20Ouverts%20APRR-AREA.pdf)) listées sur [voyage.aprr.fr/tarifs-de-peage](https://voyage.aprr.fr/tarifs-de-peage). Non ouverts, en attente de ton accord |

### Constats importants
1. **Deux concessionnaires ont une page officielle simple (ouvrages isolés)** : Millau et les ponts de Normandie. Ces valeurs sont fiables et datées.
2. **Les pages Ulys sont des estimations entre deux gares précises**, pas ville à ville, et elles contiennent parfois des chiffres contradictoires sur la même page. Elles servent de repère, pas de vérité de test. Le texte de la page précise « estimation hors modulations tarifaires ».
3. **Les tarifs peuvent changer en cours d'année** : les ponts de Normandie ont changé au **1er mai 2026** (pas au 1er février) ; une **gratuité exceptionnelle de l'A14 (sens Paris–province, du lundi au vendredi, classes 1, 2 et 5) est annoncée à partir du 16/11/2026** (travaux du tunnel de Saint-Cloud). Notre barème devra être **daté et versionné**, avec la possibilité d'une règle exceptionnelle.
4. **Millau a un tarif saisonnier** (été / hors été) : le moteur de coût doit connaître la **date du trajet**.
5. Les péages « fermés » dépendent des **gares d'entrée et de sortie** : il faudra que l'itinéraire expose les gares franchies (ou qu'on les déduise de la géométrie).

### Découverte : la grille APRR est une vraie source de données
Le PDF APRR est une table « gare d'entrée / gare de sortie / distance tarifaire / classes 1 à 5 » de ~300 pages, extractible en texte (une ligne = un couple de gares). Pour Fleury-en-Bière → Belleville : 385,58 km = 36,90 € ; → Villefranche-Limas : 430,28 km = 41,30 €, soit environ **0,096 €/km** en classe 1, avec des arrondis par couple de gares. Conséquence : le **barème maison** pour APRR/AREA peut être construit **exactement** (couples de gares) plutôt qu'au kilomètre. Il reste à confirmer que Sanef et Vinci publient des grilles équivalentes (Sanef : brochures PDF « Tarifs 2026 », Vinci : à chercher). Le PDF reste dans `Téléchargements` ; les documents tiers vont dans `data-sources/` (non versionné).

### Reste à faire pour T03, T04, T07
Interroger les simulateurs officiels interactifs (Sanef, Vinci Autoroutes/ASF, APRR) avec des gares d'entrée/sortie explicites, puis noter gares, classe, date et capture du résultat. T05, T06, T08 (0 €) sont à vérifier en lisant l'itinéraire réel (pas de gare de péage).

## Points à valider avec toi
- [ ] La liste te convient-elle ? Y a-t-il des trajets que tu fais réellement (meilleurs repères) ?
- [ ] Ton véhicule (marque, modèle, carburant) : utile pour un jeu de test de consommation réaliste.
- [ ] Veux-tu que je relève les péages et distances (recherche web, lecture seule, aucun téléchargement) ?
