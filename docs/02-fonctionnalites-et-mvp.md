# 02 — Fonctionnalités, MVP et user stories

## Besoins fonctionnels (MoSCoW)

| ID | Besoin | Priorité | Version |
|---|---|---|---|
| BF-01 | Saisir départ / arrivée avec autocomplétion d'adresse (France) | Must | MVP |
| BF-02 | Afficher l'itinéraire sur une carte interactive (zoom, déplacement) | Must | MVP |
| BF-03 | Choisir un véhicule (marque/modèle/motorisation) ou saisir une conso manuelle (L/100) | Must | MVP |
| BF-04 | Prix du carburant moyen (national puis par département), choix essence/diesel | Must | MVP |
| BF-05 | Estimer les péages du trajet | Must | MVP |
| BF-06 | Calculer le coût total + décomposition (carburant, péages) + durée + distance | Must | MVP |
| BF-07 | Ajuster la vitesse moyenne / vitesse autoroute (110, 130…) et voir l'impact sur coût et durée | Must | MVP |
| BF-08 | 2-3 itinéraires alternatifs : plus rapide / moins cher (sans péage) / équilibré | Must | MVP |
| BF-09 | Inscription / connexion / déconnexion / mot de passe oublié | Must | MVP+ |
| BF-10 | Sauvegarder, lister, renommer, supprimer ses trajets | Must | MVP+ |
| BF-11 | Gérer ses véhicules (garage) et un véhicule par défaut | Should | V1 |
| BF-12 | Suppression du compte et export des données (RGPD) | Must | V1 |
| BF-13 | Connexion Google (OAuth) | Could | V1 |
| BF-14 | Prix carburant réel autour de l'itinéraire (stations, détour) | Could | V1.2 |
| BF-15 | Calque « routes sinueuses » (indice de sinuosité par tronçon) | Should | V2 |
| BF-16 | Calque « tronçons accidentogènes » (accidents BAAC agrégés) | Should | V2 |
| BF-17 | Préférence « éviter sinueux/dangereux » dans la recherche d'itinéraire | Could | V2 |
| BF-18 | Véhicules électriques / hybrides (kWh, prix recharge) | Could | V2 |
| BF-19 | Coût par passager / partage de frais covoiturage | Could | V2 |
| BF-20 | Partager un trajet par lien public | Could | V2 |
| BF-21 | Coûts annexes : usure, pneus, amortissement (barème kilométrique) | Could | V2 |
| BF-22 | Départ à une heure donnée / jours fériés (trafic estimé) | Won't | — |
| BF-23 | Navigation guidée, trafic temps réel, app native | Won't | — |

## Besoins non fonctionnels
- **BNF-01 Performance** : calcul < 3 s p95 ; carte fluide sur mobile.
- **BNF-02 Responsive** : mobile d'abord (les gens planifient sur téléphone).
- **BNF-03 Sécurité** : RLS Supabase sur toutes les tables utilisateur, clés tierces jamais exposées au navigateur, rate limiting sur l'API, validation Zod des entrées, CORS restreint au domaine.
- **BNF-04 RGPD** : minimisation, consentement cookies (si traceurs), suppression de compte, hébergement UE (région Supabase UE).
- **BNF-05 Accessibilité** : contrastes, navigation clavier du formulaire, alternative texte au résultat de la carte (RGAA/WCAG AA visé).
- **BNF-06 Transparence** : afficher d'où viennent les chiffres (prix carburant du jour, hypothèses de conso) et un avertissement « estimation ».
- **BNF-07 Observabilité** : logs API, alerte si le job de prix carburant échoue.

## Définition du MVP

> **Un visiteur anonyme saisit un trajet, choisit son véhicule, et voit en < 3 s le coût (carburant + péages), la durée et 2-3 alternatives sur une carte, avec un curseur de vitesse.**

Le **MVP est découpé en deux jalons** pour livrer vite et valider le calcul (le vrai risque) avant de construire le reste :

| Jalon | Contenu | Pourquoi |
|---|---|---|
| **MVP-0 « Calculateur »** | BF-01 à BF-08, sans compte | Valide la valeur et la précision du calcul ; publiable sur OVH |
| **MVP-1 « Comptes »** | BF-09, BF-10 (+ BF-11 simple) | Fidélisation ; trajets sauvegardés |
| V1 | BF-11 à BF-13, finitions, SEO, RGPD complet | Mise en production « propre » |
| V2 | Sinueux/dangereux, électrique, partage… | Différenciation |

**Hors MVP volontairement** : sinueux / dangereux. C'est la fonctionnalité la plus différenciante mais aussi la plus lourde en données (géotraitement PostGIS) ; le calcul de coût doit d'abord être fiable.

## User stories (MVP-0 / MVP-1)

**US-01 — Calculer un trajet** *(BF-01, 02, 06)*
En tant que conducteur, je veux saisir départ et arrivée afin de voir le coût estimé et l'itinéraire.
- Étant donné deux adresses valides en France, quand je lance le calcul, alors la carte affiche l'itinéraire et un bandeau indique coût total, carburant, péages, durée, distance.
- Étant donné une adresse introuvable, alors un message clair propose de corriger la saisie.

**US-02 — Choisir mon véhicule** *(BF-03)*
En tant que conducteur, je veux sélectionner marque/modèle/motorisation afin que la consommation soit celle de ma voiture.
- Quand je tape « clio », alors je vois des suggestions avec carburant et consommation mixte.
- Si mon modèle n'existe pas, je peux saisir une conso L/100 manuelle.

**US-03 — Régler la vitesse** *(BF-07)*
En tant que conducteur, je veux modifier ma vitesse de croisière afin de voir l'effet sur coût et durée.
- Quand je passe l'autoroute de 130 à 110, alors le coût et la durée se mettent à jour sans nouvel appel réseau (recalcul local).

**US-04 — Comparer des itinéraires** *(BF-08)*
En tant que conducteur, je veux voir un itinéraire sans péage et un itinéraire rapide afin de choisir entre gain de temps et économie.
- Alors un tableau compare coût, durée, distance, péages ; le moins cher et le plus rapide sont étiquetés.
- Alors le tableau indique « +X € pour gagner Y min » (coût de la minute gagnée).

**US-05 — Prix carburant** *(BF-04)*
En tant que conducteur, je veux choisir essence/diesel et voir la date du prix utilisé afin de faire confiance au calcul.

**US-06 — Créer un compte** *(BF-09)*
En tant que visiteur, je veux m'inscrire (email + mot de passe) afin de conserver mes trajets.
- Alors je reçois un email de confirmation ; mot de passe oublié fonctionnel.

**US-07 — Sauvegarder un trajet** *(BF-10)*
En tant qu'utilisateur connecté, je veux sauvegarder un trajet afin de le retrouver et de le recalculer plus tard avec le prix du carburant du jour.
- Étant donné un trajet sauvegardé, quand je le rouvre, alors il est recalculé avec les prix actuels et l'ancien coût reste visible pour comparaison.
- Un utilisateur ne voit jamais les trajets d'un autre (test RLS).

**US-08 — Mon garage** *(BF-11)*
En tant qu'utilisateur, je veux enregistrer mes véhicules afin de ne pas les ressaisir.

### Definition of Ready
Critères d'acceptation écrits, données/API nécessaires identifiées, maquette ou croquis si UI.
### Definition of Done
Code relu (auto-relecture + lint), tests unitaires sur le moteur de coût, test manuel mobile, déployé en préproduction, documentation à jour.
