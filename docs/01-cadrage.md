# 01 — Fiche de cadrage

## Problème
Les calculateurs d'itinéraire donnent durée et distance, rarement un **coût réaliste** adapté à *son* véhicule et à *sa* façon de rouler. Les simulateurs de coût existants sont soit génériques (prix au km forfaitaire), soit n'intègrent pas péages + vitesse + type de route.

## Objectifs (SMART)
| # | Objectif | Mesure |
|---|---|---|
| O1 | Estimer le coût d'un trajet (carburant + péages) | Écart ≤ 10 % vs réel sur un **benchmark de 10 trajets de référence** dont le péage réel est connu |
| O2 | Réponse rapide | Résultat affiché en < 3 s (p95) hors démarrage à froid de l'API |
| O3 | Compte + trajets sauvegardés | Inscription → sauvegarde d'un trajet en < 1 min |
| O4 | Comparer des itinéraires | Au moins 2 alternatives (plus rapide / moins cher) par recherche |
| O5 | Coût d'exploitation maîtrisé | ≤ ~10 €/mois en phase de lancement (⚠️ à confirmer avec les plans réels) |

## Périmètre
**Inclus (MVP → V1)** : France métropolitaine, voiture thermique (essence/diesel), calcul carburant + péages, choix du véhicule, vitesse moyenne ajustable, carte interactive, comptes, trajets sauvegardés, alternatives.
**Inclus plus tard** : routes sinueuses / dangereuses, électrique/hybride, stations-service sur le trajet, partage de trajet, covoiturage (répartition des frais).
**Exclu définitivement** : toute fonctionnalité payante (abonnement, premium, paiement). Le site est 100 % gratuit. Publicité : possible en toute fin, mais **évitée** (préférence du porteur).
**Inclus dès la conception (décision D-017)** : plusieurs catégories de véhicules — voiture, utilitaire, camping-car, camion porteur, ensemble articulé, moto — avec la classe de péage, les vitesses et les pauses réglementaires adaptées ; coûts hors taxes pour les professionnels. Exposé dans l'interface à partir de V1.
**Exclu (Won't, pour l'instant)** : navigation guidée turn-by-turn, trafic temps réel, hors France, application mobile native, publicité/paiement, salaires des conducteurs et coûts d'exploitation complets d'un transporteur (pneus, entretien, assurance).

## Parties prenantes
- Porteur / décideur / développeur : l'utilisateur, seul sur le projet (confirmé 2026-11-09).
- Rythme : à vue d'œil, sans planification d'heures ni dates fermes (confirmé).
- Utilisateurs cibles (hypothèse) : particuliers qui planifient un trajet long (vacances, week-end), covoitureurs, personnes qui hésitent entre autoroute et nationale.

## Contraintes
- **Technique imposées** : Supabase pour la base ; API REST maison sur Render *si nécessaire* ; site sur Vercel avec le nom de domaine déjà possédé chez OVH.
- **Budget** : minimal (free tiers). Les API de routage/péage payantes sont le principal risque de coût.
- **Légal** : RGPD (adresses de départ/arrivée = données personnelles), attribution OpenStreetMap, conditions d'utilisation des API tierces, avertissement « estimation indicative ».
- **Temps** : aucune contrainte de délai, développement à vue d'œil.
- **Code** : dépôt git local hors OneDrive (`C:\dev\cout-trajet`) + dépôt GitHub.

## Critères de réussite
1. Le benchmark de 10 trajets est dans la tolérance de 10 %.
2. Un inconnu comprend le résultat sans explication (décomposition lisible : carburant / péages / durée).
3. Le site tourne en production sur le domaine, avec HTTPS, comptes fonctionnels.

## Hypothèses (⚠️ à valider)
- H1 : le site est hébergé sur **Vercel**, le domaine reste chez OVH (simple configuration DNS). Plan Hobby gratuit = non commercial ⚠️ : compatible tant qu'il n'y a **ni pub ni paiement** (une pub le rendrait commercial).
- H2 : Le prix carburant moyen se récupère via l'open data officiel (prix-carburants.gouv.fr / data.gouv.fr), mis à jour quasi en continu.
- H3 : La base ADEME (étiquette « Car Labelling ») fournit consommations urbaine / extra-urbaine / mixte par modèle.
- H4 : Un service de routage fournit géométrie + alternatives + vitesses/types de route ; **les péages sont le trou probable**.
- H5 : Les données d'accidents BAAC (open data) suffisent pour un indicateur de dangerosité « indicatif ».

## Questions ouvertes (bloquantes en gras)
1. ~~Type d'offre OVH~~ → réglé : Vercel + domaine OVH.
2. ~~Seul ? Heures ?~~ → seul, à vue d'œil.
3. ~~Techno back~~ → TypeScript / Node.js.
Monétisation → réglé : 100 % gratuit, rien de payant, pubs évitées.
4. Nom du projet et sous-domaine (ex. `trajet.tondomaine.fr`) ?
5. Objectif du site : outil public gratuit (audience via SEO) ou surtout perso/portfolio ?
6. ~~Budget mensuel~~ → **0 € strict** (confirmé 2026-11-09). Tout doit rester dans les offres gratuites (Vercel Hobby, Supabase free, Render free, API de routage gratuite). Conséquences : API Render gratuite avec mise en veille, cache agressif, limites par utilisateur, routage/péages dans les quotas gratuits ou barème maison.
7. Langue : français seul ?
