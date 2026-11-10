'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Autocomplete } from '@/components/Autocomplete';
import { CloseIcon, DownIcon, UpIcon } from '@/components/Icons';
import type { MapLine, MapPin, MapRole } from '@/components/RouteMap';
import {
  estimate,
  reversePlace,
  searchPlaces,
  searchVehicles,
  type EstimateResponse,
  type Place,
  type RouteEstimate,
  type VehicleSummary,
} from '@/lib/api';

// MapLibre a besoin du navigateur : chargement côté client uniquement.
const RouteMap = dynamic(() => import('@/components/RouteMap').then((m) => m.RouteMap), {
  ssr: false,
});

const CATEGORIES = [
  { value: 'car', label: 'Voiture' },
  { value: 'van', label: 'Utilitaire' },
  { value: 'motorhome', label: 'Camping-car' },
  { value: 'motorcycle', label: 'Moto' },
  { value: 'hgv-rigid', label: 'Camion porteur' },
  { value: 'hgv-articulated', label: 'Camion articulé' },
];

const FUELS = [
  { value: '', label: 'Selon le véhicule' },
  { value: 'e10', label: 'SP95-E10' },
  { value: 'sp95', label: 'SP95' },
  { value: 'sp98', label: 'SP98' },
  { value: 'gazole', label: 'Gazole' },
  { value: 'e85', label: 'E85' },
  { value: 'gplc', label: 'GPLc' },
];

// Itinéraire rapide : l'accent bleu ; sans péage : le vert, réservé à cet usage.
const COLORS = { fastest: '#2447d6', noToll: '#0e8f6b' } as const;

/** Nombre maximal d'escales (le même que côté API). */
const MAX_STOPS = 5;

/** Une étape du trajet : le texte affiché et le lieu choisi (absent tant qu'on n'a pas choisi). */
interface Point {
  id: string;
  text: string;
  place: Place | null;
}

// France métropolitaine : mêmes limites que l'API.
function inFrance(lon: number, lat: number): boolean {
  return lon >= -5.5 && lon <= 10 && lat >= 41 && lat <= 51.5;
}

const eur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function pointLabel(index: number, count: number): string {
  if (index === 0) return 'Départ';
  if (index === count - 1) return 'Arrivée';
  return `Escale ${index}`;
}

/** Repère de carte : départ noir (A), escales creuses numérotées, arrivée bleue (B). */
function pinStyle(
  index: number,
  count: number,
): { label: string; color: string; hollow?: boolean } {
  if (index === 0) return { label: 'A', color: '#1b1b1a' };
  if (index === count - 1) return { label: 'B', color: '#2447d6' };
  return { label: String(index), color: '#ffffff', hollow: true };
}

function RouteCard({ route, featured }: { route: RouteEstimate; featured: boolean }) {
  const e = route.estimate;
  const fast = route.kind === 'fastest';
  return (
    <article className={featured ? 'card featured' : 'card'}>
      <div className="card-head">
        <h2>{fast ? 'Rapide, avec péages' : 'Sans péage'}</h2>
        <span className="route-key" style={{ background: COLORS[route.kind] }} />
      </div>
      <p className="total">{eur(e.totalCostEur)}</p>
      <p className="range">
        Fourchette : {eur(e.range.lowEur)} à {eur(e.range.highEur)}
      </p>
      <dl>
        <dt>Distance</dt>
        <dd>{Math.round(route.distanceKm)} km</dd>
        <dt>Durée estimée</dt>
        <dd>
          {duration(e.durationMin + e.breaksMin)} (routeur : {duration(route.providerDurationMin)})
        </dd>
        <dt>Carburant</dt>
        <dd>
          {e.fuelLiters.toFixed(1)} L, {eur(e.fuelCostEur)}
        </dd>
        <dt>Péages</dt>
        <dd>{eur(e.tollCostEur)}</dd>
      </dl>
      {route.tolls.charges.length > 0 && (
        <details>
          <summary>Détail des péages</summary>
          <ul>
            {route.tolls.charges.map((c) => (
              <li key={c.id}>
                {eur(c.amountEur)}
                {c.source === 'estimate' ? ' (estimé)' : ''} — {c.provenance ?? c.source}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!route.tolls.complete && (
        <p className="notice warn">
          Les péages de cet itinéraire sont incomplets : le total est probablement sous-estimé.
        </p>
      )}
      {route.warnings.map((w) => (
        <p key={w} className="notice warn">
          {w}
        </p>
      ))}
    </article>
  );
}

export default function Home() {
  const nextId = useRef(2);
  const newPoint = (): Point => ({ id: `p${++nextId.current}`, text: '', place: null });

  const [points, setPoints] = useState<Point[]>([
    { id: 'p1', text: '', place: null },
    { id: 'p2', text: '', place: null },
  ]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  const [category, setCategory] = useState('car');
  const [vehicle, setVehicle] = useState<VehicleSummary | null>(null);
  const [vehicleText, setVehicleText] = useState('');
  const [consumption, setConsumption] = useState('');
  const [fuel, setFuel] = useState('e10');
  const [speed, setSpeed] = useState(110);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResponse | null>(null);

  const isTruck = category.startsWith('hgv');
  const mixed = Number(consumption.replace(',', '.'));
  const hasConsumption = Number.isFinite(mixed) && mixed >= 1 && mixed <= 40;
  const fuelKnown = fuel !== '' || isTruck || vehicle !== null;
  const vehicleOk = fuelKnown && (isTruck || vehicle !== null || hasConsumption);
  const pointsOk = points.every((p) => p.place !== null);
  const canSubmit = pointsOk && vehicleOk && !loading;

  function patchPoint(id: string, patch: Partial<Point>) {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addStop() {
    setPoints((prev) =>
      prev.length - 2 >= MAX_STOPS
        ? prev
        : [...prev.slice(0, -1), newPoint(), prev[prev.length - 1] as Point],
    );
  }

  function removePoint(id: string) {
    setPoints((prev) => (prev.length > 2 ? prev.filter((p) => p.id !== id) : prev));
  }

  function moveTo(fromId: string, toId: string) {
    setPoints((prev) => {
      const from = prev.findIndex((p) => p.id === fromId);
      const to = prev.findIndex((p) => p.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item as Point);
      return copy;
    });
  }

  function moveBy(id: string, delta: -1 | 1) {
    const index = points.findIndex((p) => p.id === id);
    const target = points[index + delta];
    if (target) moveTo(id, target.id);
  }

  function endDrag() {
    setDragId(null);
    setOverId(null);
    setArmedId(null);
  }

  /** Clic sur la carte : le point devient le départ, l'arrivée ou une escale. */
  function assignFromMap(role: MapRole, lon: number, lat: number) {
    if (!inFrance(lon, lat)) {
      setError('Ce point est hors de France métropolitaine : le calcul ne le couvre pas.');
      return;
    }
    if (role === 'stop' && points.length - 2 >= MAX_STOPS) {
      setError(`Pas plus de ${MAX_STOPS} escales.`);
      return;
    }
    setError(null);
    const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const place: Place = { label: fallback, lon, lat };

    let targetId: string;
    if (role === 'stop') {
      const created = newPoint();
      targetId = created.id;
      setPoints((prev) => [
        ...prev.slice(0, -1),
        { ...created, text: fallback, place },
        prev[prev.length - 1] as Point,
      ]);
    } else {
      const target = role === 'start' ? points[0] : points[points.length - 1];
      if (!target) return;
      targetId = target.id;
      patchPoint(targetId, { text: fallback, place });
    }

    // Le nom du lieu arrive après coup ; on ne le remplace que si le point n'a pas changé entre-temps.
    void reversePlace(lon, lat).then((label) => {
      if (!label) return;
      setPoints((prev) =>
        prev.map((p) =>
          p.id === targetId && p.place?.lon === lon && p.place.lat === lat
            ? { ...p, text: label, place: { ...p.place, label } }
            : p,
        ),
      );
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const places = points.map((p) => p.place);
    const origin = places[0];
    const destination = places[places.length - 1];
    if (!origin || !destination || !pointsOk) return;
    setLoading(true);
    setError(null);
    try {
      setResult(
        await estimate({
          origin,
          destination,
          waypoints: places.slice(1, -1).filter((p): p is Place => p !== null),
          category,
          motorwayKmh: isTruck ? 90 : speed,
          ...(vehicle && !isTruck ? { vehicleKey: vehicle.key } : {}),
          ...(!vehicle && !isTruck ? { mixedL100: mixed } : {}),
          ...(fuel ? { fuelProduct: fuel } : {}),
        }),
      );
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  const lines = useMemo<MapLine[]>(
    () =>
      (result?.routes ?? [])
        .filter((r) => r.geometry && r.geometry.length > 1)
        .map((r) => ({ id: r.kind, color: COLORS[r.kind], coordinates: r.geometry ?? [] })),
    [result],
  );

  const pins = useMemo<MapPin[]>(
    () =>
      points.flatMap((p, i) =>
        p.place
          ? [{ id: p.id, ...pinStyle(i, points.length), lon: p.place.lon, lat: p.place.lat }]
          : [],
      ),
    [points],
  );

  const c = result?.comparison;
  const stopCount = points.length - 2;
  // L'itinéraire le moins cher est encadré (rien à mettre en avant s'il n'y en a qu'un).
  const cheapest =
    result && result.routes.length > 1
      ? [...result.routes].sort((a, b) => a.estimate.totalCostEur - b.estimate.totalCostEur)[0]
          ?.kind
      : undefined;

  return (
    <main className="page">
      <section className="panel">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            €
          </span>
          <h1>Coût de trajet</h1>
        </div>
        <p className="lead">
          Carburant, péages et durée, avec l’alternative sans péage. Clique sur la carte pour
          choisir un point.
        </p>

        <form onSubmit={onSubmit}>
          <ol className="stops">
            {points.map((p, i) => (
              <li
                key={p.id}
                className={`stop${dragId === p.id ? ' dragging' : ''}${overId === p.id && dragId !== p.id ? ' over' : ''}`}
                draggable={armedId === p.id}
                onDragStart={(e) => {
                  setDragId(p.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', p.id);
                }}
                onDragOver={(e) => {
                  if (dragId) {
                    e.preventDefault();
                    setOverId(p.id);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) moveTo(dragId, p.id);
                  endDrag();
                }}
                onDragEnd={endDrag}
              >
                <button
                  type="button"
                  className="stop-marker"
                  data-kind={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'stop'}
                  aria-label={`Glisser pour déplacer : ${pointLabel(i, points.length)}`}
                  title="Glisser pour changer l’ordre"
                  onMouseDown={() => setArmedId(p.id)}
                  onMouseUp={() => setArmedId(null)}
                />

                <Autocomplete
                  label={pointLabel(i, points.length)}
                  placeholder="Ville ou adresse"
                  text={p.text}
                  onText={(text) => patchPoint(p.id, { text })}
                  search={searchPlaces}
                  display={(place) => place.label}
                  onSelect={(place) => patchPoint(p.id, { place })}
                />
                <div className="stop-tools">
                  <button
                    type="button"
                    aria-label="Monter"
                    title="Monter"
                    disabled={i === 0}
                    onClick={() => moveBy(p.id, -1)}
                  >
                    <UpIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Descendre"
                    title="Descendre"
                    disabled={i === points.length - 1}
                    onClick={() => moveBy(p.id, 1)}
                  >
                    <DownIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Supprimer cette étape"
                    title="Supprimer"
                    disabled={points.length <= 2}
                    onClick={() => removePoint(p.id)}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="link-button"
            disabled={stopCount >= MAX_STOPS}
            onClick={addStop}
          >
            + Ajouter une escale
          </button>

          <label className="field">
            <span>Type de véhicule</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setVehicle(null);
                setVehicleText('');
              }}
            >
              {CATEGORIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {!isTruck && (
            <>
              <Autocomplete
                label="Modèle"
                placeholder="Ex. Clio, Kangoo, 308…"
                text={vehicleText}
                onText={setVehicleText}
                search={searchVehicles}
                display={(v) =>
                  `${v.brand} ${v.description} (${v.mixedL100} L/100${v.detailEstimated ? ', moyenne' : ''})`
                }
                emptyMessage="Modèle introuvable : saisis plus bas sa consommation moyenne."
                onSelect={setVehicle}
              />
              {vehicle === null && (
                <label className="field">
                  <span>… ou consommation moyenne (L/100 km)</span>
                  <input
                    inputMode="decimal"
                    placeholder="Ex. 6,5"
                    value={consumption}
                    onChange={(e) => setConsumption(e.target.value)}
                  />
                </label>
              )}
            </>
          )}

          <div className="row">
            <label className="field">
              <span>Carburant</span>
              <select value={fuel} onChange={(e) => setFuel(e.target.value)}>
                {FUELS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Vitesse sur autoroute : {isTruck ? 90 : speed} km/h</span>
              <input
                type="range"
                min={90}
                max={130}
                step={5}
                value={isTruck ? 90 : speed}
                disabled={isTruck}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </label>
          </div>

          <button className="primary" type="submit" disabled={!canSubmit}>
            {loading ? 'Calcul en cours…' : 'Calculer le coût'}
          </button>
          {!canSubmit && !loading && (
            <p className="footnote">
              Choisis chaque étape dans les suggestions (ou sur la carte), puis un modèle (ou une
              consommation et un carburant).
            </p>
          )}
        </form>

        {error && <p className="notice error">{error}</p>}

        {result && (
          <div className="cards">
            {c && (
              <p className="compare">
                {c.extraCostEur >= 0 ? (
                  <>
                    Les péages coûtent <strong>{eur(c.extraCostEur)}</strong> de plus et font gagner{' '}
                    <strong>{duration(c.minutesSaved)}</strong>
                    {c.eurPerHourSaved !== null && (
                      <> ({eur(c.eurPerHourSaved)} par heure gagnée)</>
                    )}
                    .
                  </>
                ) : (
                  <>L’itinéraire sans péage est à la fois plus rapide et moins cher.</>
                )}
              </p>
            )}
            {result.routes.map((r) => (
              <RouteCard key={r.kind} route={r} featured={r.kind === cheapest} />
            ))}
            {result.warnings.map((w) => (
              <p key={w} className="notice warn">
                {w}
              </p>
            ))}
          </div>
        )}

        <p className="footnote">
          Estimation indicative. Prix du carburant : moyenne nationale du jour. Péages : grilles
          officielles des concessionnaires.
        </p>
      </section>

      <RouteMap lines={lines} pins={pins} onAssign={assignFromMap} />
    </main>
  );
}
