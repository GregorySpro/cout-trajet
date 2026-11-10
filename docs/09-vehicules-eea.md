# 09 — Compléter les véhicules avec la base européenne (EEA)

L'ADEME (« Car Labelling ») ne couvre que 594 versions récentes : pas de Renault Kadjar, par exemple. La base européenne de surveillance du CO₂ des voitures neuves recense toutes les immatriculations, dont celles de France.

Source : [Monitoring of CO2 emissions from passenger cars, Regulation (EU) 2019/631](https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b) (Agence européenne pour l'environnement).

## Ce que l'import fait
1. Lit les fichiers CSV de `data-sources/eea/` ligne par ligne (ils sont volumineux) et ne garde que `MS = FR`.
2. Retient l'essence, le diesel et l'hybride non rechargeable ; écarte l'électrique, le rechargeable, le GPL, l'E85, la bicarburation.
3. Regroupe par motorisation (marque, modèle, énergie, cylindrée, puissance), garde l'année la plus récente et fait la moyenne de la consommation `Fc` (L/100 km).
4. Déduit le détail ville / route / autoroute avec les rapports médians de l'ADEME : ×1,257 / ×0,861 / ×1,039 (constantes `PHASE_RATIOS`). C'est une **estimation**, signalée dans l'API (`detailEstimated`) et dans les résultats.
5. Fusionne avec l'ADEME : quand un modèle (même marque, même nom) existe chez elle, **l'ADEME l'emporte** et les lignes EEA correspondantes sont écartées.

## Étapes
1. Télécharger les CSV EEA (années 2018 à 2025 conseillées) depuis la page ci-dessus et les déposer dans `data-sources/eea/` (dossier ignoré par git).
2. Importer :

```bash
pnpm --filter @cout-trajet/reference-data run import-eea
```

3. Envoyer en base :

```bash
pnpm --filter @cout-trajet/db run load
```

## Ce que les vrais fichiers ont montré (fichier 2018, 2,3 millions de lignes pour la France)
- Les archives téléchargées sont des `.zip` imbriqués (compression que Python ne lit pas) : les extraire avec 7-Zip, puis déposer le `.csv` dans `data-sources/eea/`. Le script ignore les `.zip` et les téléchargements en cours (`.crdownload`).
- Séparateur tabulation, noms de colonnes en casse variable (`ec (cm3)` / `Ec (cm3)`) : la comparaison ignore la casse.
- Pas de colonne `Fc` (consommation) dans l'ancien fichier : elle est déduite du CO₂ **WLTP** (`Ewltp (g/km)`) avec 2 331 g de CO₂ par litre d'essence et 2 640 g par litre de gazole. Le CO₂ du cycle **NEDC** est ignoré (trop optimiste), donc seules les voitures homologuées WLTP sont retenues (747 655 lignes sur 2 320 925 en 2018).
- Pas de colonne `Year` ni d'année dans le nom du fichier 2018 : nommer le fichier avec l'année (`CO2_passenger_cars_2018.csv`) ou passer `--year 2018`.
- Les hybrides y sont codés `M` (pas `H`) : rechargeables et non rechargeables ne se distinguent pas, ils sont donc **exclus** tant que `Fm = H` n'apparaît pas.
- Options du script : `--dir <dossier>`, `--dry` (bilan sans écriture), `--show <modèle>`, `--year <année>`.

## Limites
- Une consommation mixte seule : moins précise que les mesures par phase de l'ADEME.
- Le rapprochement des noms entre les deux sources est strict (égalité après suppression des accents et signes) : un même modèle nommé différemment peut apparaître deux fois.
- Le service SQL de l'EEA renvoie des « 403 » : on passe par les fichiers téléchargés, sans contourner.
