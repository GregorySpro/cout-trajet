'use client';

import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LonLat } from '@/lib/api';
import { FlagIcon, PlusIcon, StartIcon, StopIcon } from './Icons';

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export interface MapLine {
  id: string;
  color: string;
  coordinates: LonLat[];
}

export interface MapPin {
  id: string;
  /** Texte du repère : « A », « 1 », « B »… */
  label: string;
  /** Couleur de fond ; ignorée pour un repère creux (escale). */
  color: string;
  hollow?: boolean;
  lon: number;
  lat: number;
}

export type MapRole = 'start' | 'end' | 'stop';

interface Props {
  lines: MapLine[];
  pins: MapPin[];
  onAssign: (role: MapRole, lon: number, lat: number) => void;
}

interface Pending {
  lon: number;
  lat: number;
  x: number;
  y: number;
}

export function RouteMap({ lines, pins, onAssign }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pinMarkers = useRef<maplibregl.Marker[]>([]);
  const pendingMarker = useRef<maplibregl.Marker | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState('');

  // Création de la carte, et écoute du clic.
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      center: [2.5, 46.6],
      zoom: 5,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© contributeurs OpenStreetMap',
          },
        },
        // Fond adouci (couleurs atténuées) pour que les itinéraires ressortent.
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            paint: { 'raster-saturation': -0.6, 'raster-contrast': -0.08 },
          },
        ],
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('click', (e) => {
      setMenuOpen(false);
      setPending({ lon: e.lngLat.lng, lat: e.lngLat.lat, x: e.point.x, y: e.point.y });
    });
    // Déplacer ou zoomer décale le point à l'écran : on referme le bouton plutôt que de le laisser flotter.
    m.on('movestart', () => setPending(null));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Repère gris du point cliqué.
  useEffect(() => {
    const m = map.current;
    pendingMarker.current?.remove();
    pendingMarker.current = null;
    if (m && pending) {
      const dot = document.createElement('div');
      dot.className = 'pending-dot';
      pendingMarker.current = new maplibregl.Marker({ element: dot })
        .setLngLat([pending.lon, pending.lat])
        .addTo(m);
    }
  }, [pending]);

  // Repères du départ, des escales et de l'arrivée.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of pinMarkers.current) mk.remove();
    pinMarkers.current = pins.map((p) => {
      const el = document.createElement('div');
      el.className = p.hollow ? 'pin hollow' : 'pin';
      if (!p.hollow) el.style.background = p.color;
      el.textContent = p.label;
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m);
    });
  }, [pins]);

  // Tracés des itinéraires.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const style = m.getStyle();
      for (const layer of style.layers) {
        if (layer.id.startsWith('line-')) m.removeLayer(layer.id);
      }
      for (const id of Object.keys(style.sources)) {
        if (id.startsWith('line-')) m.removeSource(id);
      }
      for (const l of lines) {
        m.addSource(`line-${l.id}`, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: l.coordinates },
          },
        });
        m.addLayer({
          id: `line-${l.id}`,
          type: 'line',
          source: `line-${l.id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': l.color, 'line-width': 5, 'line-opacity': 0.85 },
        });
      }
      const first = lines[0]?.coordinates[0];
      if (first) {
        const bounds = new maplibregl.LngLatBounds(first, first);
        for (const l of lines) for (const p of l.coordinates) bounds.extend(p);
        m.fitBounds(bounds, { padding: 50, duration: 600 });
      }
    };
    if (m.isStyleLoaded()) draw();
    else m.once('load', draw);
  }, [lines]);

  function assign(role: MapRole) {
    if (!pending) return;
    onAssign(role, pending.lon, pending.lat);
    setPending(null);
    setMenuOpen(false);
    setHint('');
  }

  const choices: { role: MapRole; label: string; icon: ReactNode }[] = [
    { role: 'start', label: 'Définir comme départ', icon: <StartIcon /> },
    { role: 'stop', label: 'Ajouter une escale', icon: <StopIcon /> },
    { role: 'end', label: 'Définir comme arrivée', icon: <FlagIcon /> },
  ];
  const shortName: Record<MapRole, string> = { start: 'Départ', stop: 'Escale', end: 'Arrivée' };

  return (
    <div className="mapwrap">
      <div ref={container} className="map" />
      {pending && (
        <div className="map-action" style={{ left: pending.x, top: pending.y }}>
          <div className={menuOpen ? 'map-bar open' : 'map-bar'}>
            <button
              type="button"
              className="map-plus"
              aria-label="Utiliser ce point pour le trajet"
              tabIndex={menuOpen ? -1 : 0}
              onClick={() => setMenuOpen(true)}
            >
              <PlusIcon />
            </button>
            <div className="map-icons" role="menu" aria-hidden={!menuOpen}>
              {choices.map((c) => (
                <button
                  key={c.role}
                  type="button"
                  role="menuitem"
                  aria-label={c.label}
                  tabIndex={menuOpen ? 0 : -1}
                  onMouseEnter={() => setHint(shortName[c.role])}
                  onMouseLeave={() => setHint('')}
                  onFocus={() => setHint(shortName[c.role])}
                  onBlur={() => setHint('')}
                  onClick={() => assign(c.role)}
                >
                  {c.icon}
                </button>
              ))}
            </div>
          </div>
          {menuOpen && hint && <span className="map-tip">{hint}</span>}
        </div>
      )}
    </div>
  );
}
