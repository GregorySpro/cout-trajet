"""Spike S2 : test OpenRouteService (itinéraire, péages, alternatives) sur les trajets de référence.

Lit ORS_API_KEY dans ../.env (jamais affichée). Peu de requêtes pour ménager le quota gratuit.
Usage : python -I ors_test.py [T01 T03 ...]
"""
import json, os, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = None
with open(os.path.join(HERE, "..", ".env"), encoding="utf-8") as f:
    for line in f:
        if line.startswith("ORS_API_KEY="):
            KEY = line.split("=", 1)[1].strip()
if not KEY:
    sys.exit("ORS_API_KEY absente de .env")

BASE = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
TRIPS = {
    "T01": ("Paris->Lyon", (2.3522, 48.8566), (4.8357, 45.7640)),
    "T02": ("Paris->Lille", (2.3522, 48.8566), (3.0573, 50.6292)),
    "T03": ("Lyon->Marseille", (4.8357, 45.7640), (5.3698, 43.2965)),
    "T04": ("Bordeaux->Toulouse", (-0.5792, 44.8378), (1.4442, 43.6047)),
    "T05": ("Rennes->Nantes", (-1.6778, 48.1173), (-1.5534, 47.2184)),
    "T07": ("Paris->Nice", (2.3522, 48.8566), (7.2620, 43.7102)),
    "T09": ("Clermont->Beziers", (3.0870, 45.7772), (3.2150, 43.3440)),
    "T10": ("Caen->LeHavre", (-0.3707, 49.1829), (0.1079, 49.4944)),
}


ALT_TRIES = {"T10"}


def call(body):
    req = urllib.request.Request(
        BASE, data=json.dumps(body).encode(),
        headers={"Authorization": KEY, "Content-Type": "application/json",
                 "Accept": "application/json, application/geo+json",
                 "User-Agent": "cout-trajet-spike/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            hdr = {k.lower(): v for k, v in r.headers.items() if k.lower().startswith("x-ratelimit")}
            return r.status, json.load(r), hdr
    except urllib.error.HTTPError as e:
        try:
            msg = json.load(e)
        except Exception:  # noqa: BLE001
            msg = {}
        return e.code, msg, {k.lower(): v for k, v in e.headers.items() if k.lower().startswith("x-ratelimit")}


def summarize(feat):
    p = feat["properties"]
    s = p["summary"]
    ex = p.get("extras", {})
    out = f"{s['distance']/1000:.1f} km, {s['duration']/60:.0f} min"
    if "tollways" in ex:
        toll_vals = ex["tollways"]["values"]
        n_idx = len(feat["geometry"]["coordinates"])
        toll_pts = sum(b - a for a, b, v in toll_vals if v == 1)
        out += f" | tollways: {toll_pts}/{n_idx} points à péage ({100*toll_pts/n_idx:.0f} %)"
    if "waytype" in ex:
        n_idx = len(feat["geometry"]["coordinates"])
        by = {}
        for a, b, v in ex["waytype"]["values"]:
            by[v] = by.get(v, 0) + (b - a)
        out += " | waytype(points): " + ", ".join(f"{k}:{v}" for k, v in sorted(by.items()))
    return out


def run(tid):
    name, o, d = TRIPS[tid]
    print(f"\n=== {tid} {name} ===")
    base = {"coordinates": [list(o), list(d)], "instructions": False,
            "extra_info": ["tollways", "waytype", "countryinfo"]}
    st, js, hdr = call(base)
    print("itinéraire simple : HTTP", st, hdr)
    if st == 200:
        print("  ", summarize(js["features"][0]))
    else:
        print("  erreur :", json.dumps(js)[:300])
    time.sleep(2)
    if tid in ALT_TRIES:  # l'algorithme d'alternatives est limité à ~100 km (constaté sur T01)
        alt = dict(base)
        alt["alternative_routes"] = {"target_count": 3, "weight_factor": 1.6, "share_factor": 0.6}
        st, js, hdr = call(alt)
        print("avec alternatives : HTTP", st, hdr)
        if st == 200:
            for i, f in enumerate(js["features"]):
                print(f"   route {i}:", summarize(f))
        else:
            print("  erreur :", json.dumps(js)[:300])
        time.sleep(2)
    av = dict(base)
    av["options"] = {"avoid_features": ["tollways"]}
    st, js, hdr = call(av)
    print("sans péage        : HTTP", st, hdr)
    if st == 200:
        print("  ", summarize(js["features"][0]))
    else:
        print("  erreur :", json.dumps(js)[:300])


if __name__ == "__main__":
    ids = sys.argv[1:] or ["T01"]
    for t in ids:
        run(t)
        time.sleep(3)
