"""Exporte une fois toutes les gares de péage de France (nœuds OpenStreetMap barrier=toll_booth).

Évite d'interroger Overpass à chaque trajet (service public instable). Sortie : un fichier JSON local
(non versionné) ; en production, ces points seront chargés dans Supabase/PostGIS.
Données © contributeurs OpenStreetMap, licence ODbL.

Usage : python -I tools/export-osm-toll-booths.py <sortie.json>
"""
import json
import sys
import urllib.parse
import urllib.request

QUERY = '[out:json][timeout:240];area["ISO3166-1"="FR"][admin_level=2]->.fr;node["barrier"="toll_booth"](area.fr);out body;'
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
UA = {"User-Agent": "cout-trajet-export/0.1 (projet perso, export ponctuel)"}

for endpoint in ENDPOINTS:
    try:
        req = urllib.request.Request(endpoint, data=urllib.parse.urlencode({"data": QUERY}).encode(), headers=UA)
        with urllib.request.urlopen(req, timeout=300) as response:
            data = json.load(response)
        with open(sys.argv[1], "w", encoding="utf-8") as out:
            json.dump(data, out)
        print("OK", endpoint, len(data["elements"]), "nœuds")
        break
    except Exception as error:  # noqa: BLE001
        print("échec", endpoint, error, flush=True)
else:
    sys.exit(2)
