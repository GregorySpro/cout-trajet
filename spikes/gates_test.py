import json, math, urllib.request, urllib.parse, sys
UA = {"User-Agent": "cout-trajet-spike/0.1 (projet perso, test ponctuel)"}
def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)
o = (2.3522, 48.8566); d = (4.8357, 45.7640)   # Paris centre -> Lyon centre
route = get(f"https://router.project-osrm.org/route/v1/driving/{o[0]},{o[1]};{d[0]},{d[1]}?overview=full&geometries=geojson")
rt = route["routes"][0]
coords = rt["geometry"]["coordinates"]
print("OSRM: distance km =", round(rt["distance"]/1000,1), " durée min =", round(rt["duration"]/60), " points =", len(coords))
lons=[c[0] for c in coords]; lats=[c[1] for c in coords]
bbox = (min(lats)-0.02, min(lons)-0.02, max(lats)+0.02, max(lons)+0.02)
q = f'[out:json][timeout:60];(node["barrier"="toll_booth"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}););out body;'
import time
ov=None
for ep in ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter"]:
    try:
        ov = get(ep, urllib.parse.urlencode({"data": q}).encode()); print("Overpass OK via", ep); break
    except Exception as e:
        print("Overpass échec", ep, e); time.sleep(5)
if ov is None: sys.exit(2)
nodes = ov["elements"]
print("toll_booth OSM dans la bbox:", len(nodes))
lat0 = math.radians(sum(lats)/len(lats)); kx = 111320*math.cos(lat0); ky = 110540
def dist_pt_seg(px,py,ax,ay,bx,by):
    dx,dy=bx-ax,by-ay
    t = 0 if dx==dy==0 else max(0,min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)))
    return math.hypot(px-(ax+t*dx), py-(ay+t*dy)), t
# cumulative distance along route
cum=[0]
for i in range(1,len(coords)):
    cum.append(cum[-1]+math.hypot((coords[i][0]-coords[i-1][0])*kx,(coords[i][1]-coords[i-1][1])*ky))
hits=[]
for n in nodes:
    px,py=n["lon"]*kx,n["lat"]*ky
    best=(1e9,0)
    for i in range(1,len(coords)):
        a=(coords[i-1][0]*kx,coords[i-1][1]*ky); b=(coords[i][0]*kx,coords[i][1]*ky)
        if abs(px-a[0])>3000 and abs(px-b[0])>3000: continue
        dd,t=dist_pt_seg(px,py,a[0],a[1],b[0],b[1])
        if dd<best[0]: best=(dd, cum[i-1]+t*(cum[i]-cum[i-1]))
    if best[0]<150:
        tg=n.get("tags",{})
        hits.append((best[1]/1000,best[0],tg.get("name") or tg.get("ref") or "(sans nom)",tg.get("operator",""),tg.get("toll:class1","")))
hits.sort()
print("Gares de péage à moins de 150 m du tracé:", len(hits))
for h in hits: print(f"  km {h[0]:6.1f}  écart {h[1]:5.0f} m  {h[2]}  | opérateur: {h[3]}")
