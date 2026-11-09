"""Spike S1 : détecte les gares de péage OSM franchies par un itinéraire OSRM.

Services publics de démonstration (OSRM, Overpass) : usage de test uniquement.
Python standard, aucune clé. Usage : python -I gates_batch.py
"""
import json, math, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "cout-trajet-spike/0.1 (projet perso, test ponctuel)"}
OVERPASS = ["https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]
STRICT_M = 25      # seuil "gare franchie" (hypothèse)
LOOSE_M = 150      # seuil "gare proche"

TRIPS = {
    "T02 Paris->Lille":      ((2.3522, 48.8566), (3.0573, 50.6292)),
    "T03 Lyon->Marseille":   ((4.8357, 45.7640), (5.3698, 43.2965)),
    "T04 Bordeaux->Toulouse": ((-0.5792, 44.8378), (1.4442, 43.6047)),
    "T09 Clermont->Beziers": ((3.0870, 45.7772), (3.2150, 43.3440)),
    "T10 Caen->LeHavre":     ((-0.3707, 49.1829), (0.1079, 49.4944)),
}


def get(url, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def overpass(q):
    for ep in OVERPASS:
        try:
            return get(ep, urllib.parse.urlencode({"data": q}).encode(), 90)
        except Exception as e:  # noqa: BLE001
            print("   Overpass échec", ep, e)
            time.sleep(8)
    return None


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t


def run(label, o, d):
    print(f"\n=== {label} ===")
    r = get(f"https://router.project-osrm.org/route/v1/driving/{o[0]},{o[1]};{d[0]},{d[1]}?overview=full&geometries=geojson")["routes"][0]
    c = r["geometry"]["coordinates"]
    print(f"OSRM : {r['distance']/1000:.1f} km, {r['duration']/60:.0f} min, {len(c)} points")
    lons = [p[0] for p in c]; lats = [p[1] for p in c]
    bb = (min(lats) - .02, min(lons) - .02, max(lats) + .02, max(lons) + .02)
    q = f'[out:json][timeout:60];node["barrier"="toll_booth"]({bb[0]},{bb[1]},{bb[2]},{bb[3]});out body;'
    ov = overpass(q)
    if ov is None:
        print("   Overpass indisponible"); return
    nodes = ov["elements"]
    lat0 = math.radians(sum(lats) / len(lats)); kx = 111320 * math.cos(lat0); ky = 110540
    cum = [0.0]
    for i in range(1, len(c)):
        cum.append(cum[-1] + math.hypot((c[i][0] - c[i-1][0]) * kx, (c[i][1] - c[i-1][1]) * ky))
    found = {}
    for n in nodes:
        px, py = n["lon"] * kx, n["lat"] * ky
        best = (1e9, 0)
        for i in range(1, len(c)):
            a = (c[i-1][0] * kx, c[i-1][1] * ky); b = (c[i][0] * kx, c[i][1] * ky)
            if min(a[0], b[0]) - 3000 > px or max(a[0], b[0]) + 3000 < px:
                continue
            dd, t = seg_dist(px, py, a[0], a[1], b[0], b[1])
            if dd < best[0]:
                best = (dd, cum[i-1] + t * (cum[i] - cum[i-1]))
        if best[0] < LOOSE_M:
            tg = n.get("tags", {})
            name = tg.get("name") or tg.get("ref") or "(sans nom)"
            key = name
            prev = found.get(key)
            if prev is None or best[0] < prev[1]:
                found[key] = (best[1] / 1000, best[0], tg.get("operator", ""))
    rows = sorted(found.items(), key=lambda kv: kv[1][0])
    print(f"gares OSM dans la zone : {len(nodes)} ; noms < {LOOSE_M} m du tracé : {len(rows)}")
    for name, (km, dist, op) in rows:
        mark = "FRANCHIE" if dist <= STRICT_M else "bretelle?"
        print(f"  km {km:6.1f}  écart {dist:5.0f} m  {mark:9s} {name}  [{op}]")
    time.sleep(6)


if __name__ == "__main__":
    for lbl, (o, d) in TRIPS.items():
        try:
            run(lbl, o, d)
        except Exception as e:  # noqa: BLE001
            print(f"=== {lbl} === erreur : {e}")
