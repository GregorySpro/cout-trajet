"""Spike S1 : péage de bout en bout (ORS tollways + gares OSM + grille APRR).

- Itinéraire : OpenRouteService (clé dans ../.env, jamais affichée), réponses mises en cache dans data-sources/cache.
- Gares : OpenStreetMap via Overpass (cache).
- Prix : grille officielle APRR (texte extrait de data-sources/aprr_texte_extrait.txt) quand les gares sont APRR.
Usage : python -I e2e_tolls.py [T01 T02 ...]
"""
import json, math, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
CACHE = os.path.join(ROOT, "data-sources", "cache")
os.makedirs(CACHE, exist_ok=True)
STRICT_M = 10
UA = {"User-Agent": "cout-trajet-spike/0.1 (projet perso, test ponctuel)"}

KEY = None
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        if line.startswith("ORS_API_KEY="):
            KEY = line.split("=", 1)[1].strip()
if not KEY:
    sys.exit("ORS_API_KEY absente")

TRIPS = {
    "T01": ("Paris->Lyon", (2.3522, 48.8566), (4.8357, 45.7640), 41.30),
    "T02": ("Paris->Lille", (2.3522, 48.8566), (3.0573, 50.6292), 18.90),
    "T03": ("Lyon->Marseille", (4.8357, 45.7640), (5.3698, 43.2965), 28.10),
    "T04": ("Bordeaux->Toulouse", (-0.5792, 44.8378), (1.4442, 43.6047), 22.90),
    "T09": ("Clermont->Beziers", (3.0870, 45.7772), (3.2150, 43.3440), 11.30),
    "T10": ("Caen->LeHavre", (-0.3707, 49.1829), (0.1079, 49.4944), 6.10),
}


def norm(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"^PEAGE (DE |D')?", "", s).strip()
    return re.sub(r"\s+", " ", s)


def ors_route(tid, o, d):
    path = os.path.join(CACHE, f"ors_{tid}.json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    body = {"coordinates": [list(o), list(d)], "instructions": False, "extra_info": ["tollways"]}
    req = urllib.request.Request(
        "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
        data=json.dumps(body).encode(),
        headers={"Authorization": KEY, "Content-Type": "application/json",
                 "Accept": "application/json, application/geo+json", "User-Agent": UA["User-Agent"]})
    with urllib.request.urlopen(req, timeout=90) as r:
        js = json.load(r)
    json.dump(js, open(path, "w", encoding="utf-8"))
    return js


def overpass(tid, bb):
    path = os.path.join(CACHE, f"osm_{tid}.json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    q = f'[out:json][timeout:60];node["barrier"="toll_booth"]({bb[0]},{bb[1]},{bb[2]},{bb[3]});out body;'
    for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
               "https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"]:
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                js = json.load(r)
            json.dump(js, open(path, "w", encoding="utf-8"))
            return js
        except Exception as e:  # noqa: BLE001
            print("   Overpass échec", ep, e); time.sleep(6)
    return {"elements": []}


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def aprr_price(a, b, lines):
    pre = f"{a} {b} "
    for ln in lines:
        if ln.startswith(pre):
            m = re.search(r"(\d+,\d{2}) (\d+,\d{2}) €", ln)
            if m:
                return float(m.group(2).replace(",", ".")), float(m.group(1).replace(",", "."))
    return None


def run(tid, aprr_lines):
    name, o, d, ref = TRIPS[tid]
    print(f"\n=== {tid} {name} (référence officielle : {ref:.2f} €) ===")
    js = ors_route(tid, o, d)
    feat = js["features"][0]
    c = feat["geometry"]["coordinates"]
    s = feat["properties"]["summary"]
    print(f"ORS : {s['distance']/1000:.1f} km, {s['duration']/60:.0f} min, {len(c)} points")
    toll = [(a, b) for a, b, v in feat["properties"]["extras"]["tollways"]["values"] if v == 1]
    # fusion des plages contiguës
    merged = []
    for a, b in toll:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    print(f"tronçons à péage (ORS) : {len(merged)} -> indices {[(a,b) for a,b in merged][:6]}")
    lons = [p[0] for p in c]; lats = [p[1] for p in c]
    osm = overpass(tid, (min(lats) - .02, min(lons) - .02, max(lats) + .02, max(lons) + .02))["elements"]
    lat0 = math.radians(sum(lats) / len(lats)); kx = 111320 * math.cos(lat0); ky = 110540
    P = [(p[0] * kx, p[1] * ky) for p in c]
    def mindist(n):
        px, py = n["lon"] * kx, n["lat"] * ky; best = 1e9; bi = 0
        for i in range(1, len(P)):
            if min(P[i-1][0], P[i][0]) - 2000 > px or max(P[i-1][0], P[i][0]) + 2000 < px:
                continue
            dd = seg_dist(px, py, *P[i-1], *P[i])
            if dd < best:
                best, bi = dd, i
        return best, bi
    gates = []
    for n in osm:
        dd, bi = mindist(n)
        if dd <= STRICT_M:
            tg = n.get("tags", {})
            gates.append((bi, tg.get("name") or tg.get("ref") or "?", dd, tg.get("operator", "")))
    gates.sort()
    seen, uniq = set(), []
    for g in gates:
        k = norm(g[1])
        if k not in seen:
            seen.add(k); uniq.append(g)
    print("gares franchies (<= %d m) : %s" % (STRICT_M, ", ".join(f"{g[1]}[{g[3]}]@pt{g[0]}" for g in uniq) or "aucune"))
    # gares proches des extrémités des tronçons à péage ORS (rayon 500 m)
    for a, b in merged[:4]:
        for label, idx in (("début", a), ("fin", min(b, len(P) - 1))):
            near = sorted(((math.hypot(n["lon"] * kx - P[idx][0], n["lat"] * ky - P[idx][1]), n.get("tags", {}).get("name", "?")) for n in osm))[:2]
            print(f"  tronçon [{a},{b}] {label}: gares OSM les plus proches : " + "; ".join(f"{nm} ({dist:.0f} m)" for dist, nm in near))
    # prix
    names = [norm(g[1]) for g in uniq]
    if len(names) >= 2 and aprr_lines:
        p = aprr_price(names[0], names[-1], aprr_lines)
        if p:
            print(f"prix grille APRR {names[0]} -> {names[-1]} : {p[0]:.2f} € ({p[1]:.1f} km tarifaires)  | écart vs référence : {100*(p[0]-ref)/ref:+.1f} %")
        else:
            print(f"paire {names[0]} -> {names[-1]} introuvable dans la grille APRR (autre concessionnaire ou nom différent)")
    elif len(names) == 1:
        print(f"une seule gare détectée ({names[0]}) : péage à l'unité (référence {ref:.2f} €)")


if __name__ == "__main__":
    lines = []
    p = os.path.join(ROOT, "data-sources", "aprr_texte_extrait.txt")
    if os.path.exists(p):
        lines = [ln.strip() for ln in open(p, encoding="utf-8")]
    for t in (sys.argv[1:] or list(TRIPS)):
        try:
            run(t, lines)
        except urllib.error.HTTPError as e:
            print(f"=== {t} === erreur HTTP {e.code}")
        except Exception as e:  # noqa: BLE001
            print(f"=== {t} === erreur : {e}")
        time.sleep(3)
