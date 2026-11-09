# 05 — Planning, spikes, risques, RGPD

## Méthode
Projet solo, sans échéance : **Kanban léger**, WIP = 2, issues GitHub. Pas de dates ni d'estimation d'heures : seul l'**ordre** des étapes compte. Pas de Scrum (aucun intérêt seul).

## Phase 0 — Spikes (avant tout code applicatif)
Objectif : lever les inconnues qui peuvent remettre en cause le projet. Chacun produit une note de 1 page dans `docs/spikes/`.

| Spike | Question | Résultat attendu | Durée |
|---|---|---|---|
| S1 | **Péages** : HERE/TomTom renvoient-ils le coût en France ? Sinon, quel barème maison ? | Choix + coût mensuel estimé | 2-3 j |
| S2 | Routage : qualité, quotas, alternatives, vitesses/types de route disponibles | Choix du `RoutingProvider` | 2 j |
| S3 | Benchmark : 10 trajets de référence (coût péage réel connu, conso réelle) | Fichier de référence pour les tests | 1 j |
| S4 | ADEME : format, couverture des modèles, mapping conso urbain/extra/mixte | Schéma d'import | 1 j |
| S5 | Prix carburants : format du flux, fiabilité, calcul de la moyenne | Schéma + script prototype | 1 j |
| S6 | Tuiles + MapLibre : fournisseur, quotas, attribution | Choix du fournisseur | 0,5 j |
| S7 | Vercel + DNS OVH : ajout du domaine, enregistrements, HTTPS, conditions du plan Hobby | Procédure de déploiement | 0,5 j |
| S8 | Render gratuit : temps de réveil réel, limites | Décision plan gratuit/payant | 0,5 j |

**Critère de passage (go/no-go)** : on sait calculer les péages avec une erreur acceptable sur ≥ 8 des 10 trajets pour un coût supportable. Sinon : décision de périmètre (ex. « péages estimés au km » avec fourchette large, ou lancement sans péages précis).

## Roadmap (ordre des étapes, sans dates)

1. **Cadrage validé** (nom du projet, périmètre).
2. **Spikes S1-S8** → go/no-go sur les péages.
3. **Socle** : monorepo, CI, déploiement Vercel + Render, projet Supabase.
4. **MVP-0 Calculateur** : cost-engine + tests → API (itinéraire, prix, véhicules) → front carte/formulaire/résultat → alternatives + curseur de vitesse. *Publiable.*
5. **MVP-1 Comptes** : auth, RLS, trajets sauvegardés.
6. **V1** : garage, RGPD complet, SEO, finitions.
7. **V2** : sinueux / dangereux, électrique, partage.

Règle : on ne passe à l'étape suivante que quand la précédente est utilisable. Les durées dépendront du résultat des spikes et du temps libre ; aucune échéance n'est fixée.

## Premiers jalons détaillés

### Jalon 0 — Cadrage validé
- [ ] Répondre aux questions ouvertes (01-cadrage) — 30 min
- [ ] Choisir le nom + sous-domaine — 30 min
- [ ] Valider le périmètre MVP-0 / MVP-1 — 30 min

### Jalon 1 — Spikes terminés
- [ ] S3 : dresser les 10 trajets de référence — 3 h
- [ ] S1 + S2 : tester les services sur ces trajets — 2 j — dépend de S3
- [ ] Notes de décision dans `decisions.md`

### Jalon 2 — Socle technique
- [ ] Monorepo + lint + typecheck + CI — 3 h
- [ ] Projet Supabase (région UE) + migrations versionnées — 3 h
- [ ] « Hello world » déployé sur OVH et sur Render — 4 h

## Risques et pré-mortem

| # | Risque (cause d'échec) | Prob. | Impact | Prévention / signal d'alerte | Plan B |
|---|---|---|---|---|---|
| R1 | **Péages imprécis ou API trop chère** | Haute | Critique | Spike S1 en tout premier ; benchmark chiffré | Fourchette de péage au km par concession ; ou affichage « péages estimés » |
| R2 | Coût/quotas des API de routage explosent avec le trafic | Moyenne | Haute | Cache agressif, limites par utilisateur, alertes de quota | Routage auto-hébergé sur VPS |
| R3 | Estimation de conso trop éloignée du réel | Moyenne | Haute | Calibration sur benchmark, fourchette affichée, transparence | Mode « ma conso réelle » saisie par l'utilisateur |
| R4 | Périmètre qui grossit (sinueux, EV, covoiturage…) avant que le calcul soit bon | Haute | Moyenne | MVP-0 sans compte ni calques ; règle « pas de V2 avant MVP-1 » | — |
| R5 | API Render en veille → mauvaise première impression | Haute | Moyenne | État de chargement ; passage au plan payant | Edge Functions Supabase |
| R6 | Données (ADEME, carburant) changent de format/URL | Moyenne | Moyenne | Jobs avec alerte d'échec, dernier snapshot conservé | Import manuel |
| R7 | Lassitude / manque de temps (projet solo) | Moyenne | Haute | MVP-0 petit et publiable ; jalons de 2 semaines | Réduire le périmètre |
| R8 | Problème légal (conditions d'usage API, RGPD, responsabilité sur la dangerosité) | Faible | Haute | Lire les CGU au spike ; disclaimers ; mentions légales | Retirer le calque risque |
| R9 | Plan Vercel gratuit non autorisé si usage commercial / quotas dépassés | Moyenne | Moyenne | Décider tôt si le site est monétisé ; surveiller les quotas | Plan Pro ou autre hébergeur de front |

## RGPD (minimum)
- Données personnelles : email, adresses de trajets (peuvent révéler domicile/travail), véhicules.
- Base légale : exécution du service (compte) ; consentement pour tout traceur non essentiel (préférer une analytics sans cookie type Plausible/Umami ⚠️ à évaluer).
- Droits : suppression de compte (cascade), export JSON (BF-12), pas de revente ni de partage.
- Les adresses saisies sont envoyées à des tiers (géocodage, routage) → à indiquer dans la politique de confidentialité.
- Pages à prévoir : mentions légales, politique de confidentialité, CGU (disclaimer « estimation indicative, non contractuelle »), attribution OpenStreetMap.

## Décisions à prendre cette semaine
1. Réponses aux 3 questions bloquantes (OVH, temps disponible, langage back).
2. Valider le découpage MVP-0 / MVP-1 (comptes après le calculateur).
3. Lancer S3 puis S1.
