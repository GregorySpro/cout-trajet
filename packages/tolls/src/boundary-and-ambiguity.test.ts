import { describe, expect, it } from 'vitest';
import { TollBook } from './book';
import { OPEN_TOLLS } from './open-tolls';
import { resolveRouteGates, type GateMapping } from './gate-resolver';
import { computeTripTolls } from './trip-tolls';
import type { Concession, PricePair } from './types';

function pair(concession: Concession, from: string, to: string, c1: number): PricePair {
  return {
    concession,
    from,
    to,
    distanceKm: null,
    prices: { 1: c1, 2: c1 * 1.5, 3: c1 * 2.4, 4: c1 * 3.4, 5: c1 * 0.6 },
  };
}

const known = new Set([
  'COFIROUTE:ORLEANS NORD',
  'COFIROUTE:PARIS (LA FOLIE BESSIN)',
  'COFIROUTE:TOURS CENTRE (MONNAIE)',
  'ASF:TOULOUSE-NORD/EST',
  'ASF:TOULOUSE-NORD/OUEST',
  'ASF:SAINT-SELVE',
]);

const book = new TollBook([
  pair('COFIROUTE', 'COFIROUTE:PARIS (LA FOLIE BESSIN)', 'COFIROUTE:TOURS CENTRE (MONNAIE)', 26),
  pair('ASF', 'ASF:TOULOUSE-NORD/EST', 'ASF:SAINT-SELVE', 22.9),
  pair('ASF', 'ASF:TOULOUSE-NORD/OUEST', 'ASF:SAINT-SELVE', 22.2),
  // Frontière : Paris → Angers sur Cofiroute, puis Angers → Nantes sur ASF (réseaux fictifs de test).
  pair('COFIROUTE', 'COFIROUTE:PARIS (LA FOLIE BESSIN)', 'COFIROUTE:ANGERS (CORZE)', 32.9),
  pair('ASF', 'ASF:CORZE', 'ASF:NANTES', 10.4),
]);

const ctx = {
  book,
  openTolls: OPEN_TOLLS,
  vehicleClass: 1 as const,
  date: new Date('2026-11-09'),
};

describe('correspondance par alias : prix estimé, pas officiel', () => {
  const mappings: GateMapping[] = [
    { names: ['Péage de Saint-Arnoult'], gates: ['COFIROUTE:PARIS (LA FOLIE BESSIN)'] },
  ];

  it('une gare rapprochée par alias est signalée incertaine', () => {
    const r = resolveRouteGates(
      [
        { name: 'Péage de Saint-Arnoult', operator: 'Cofiroute', lat: 48.5, lon: 1.9 },
        { name: 'Péage de Monnaie', operator: 'COFIROUTE', lat: 47.5, lon: 0.7 },
      ],
      mappings,
      { knownGates: known },
    );
    expect(r.gates).toEqual([
      'COFIROUTE:PARIS (LA FOLIE BESSIN)',
      'COFIROUTE:TOURS CENTRE (MONNAIE)',
    ]);
    expect(r.autoMatched).toEqual(['COFIROUTE:TOURS CENTRE (MONNAIE)']);
    expect(r.uncertain).toEqual(['COFIROUTE:TOURS CENTRE (MONNAIE)']);
    expect(r.warnings[0]).toContain('alias');
  });

  it('le péage correspondant est marqué « estimé » mais bien chiffré', () => {
    const r = resolveRouteGates(
      [
        { name: 'Péage de Saint-Arnoult', operator: 'COFIROUTE', lat: 48.5, lon: 1.9 },
        { name: 'Péage de Monnaie', operator: 'COFIROUTE', lat: 47.5, lon: 0.7 },
      ],
      mappings,
      { knownGates: known },
    );
    const t = computeTripTolls(r.gates, {
      ...ctx,
      uncertainGates: new Set(r.uncertain),
      alternatives: new Map(Object.entries(r.alternatives)),
    });
    expect(t.charges).toHaveLength(1);
    expect(t.charges[0]?.amountEur).toBe(26);
    expect(t.charges[0]?.source).toBe('estimate');
  });

  it('une gare rapprochée par nom exact reste un tarif officiel', () => {
    const t = computeTripTolls(
      ['COFIROUTE:PARIS (LA FOLIE BESSIN)', 'COFIROUTE:TOURS CENTRE (MONNAIE)'],
      ctx,
    );
    expect(t.charges[0]?.source).toBe('official');
  });
});

describe('gare ambiguë (Toulouse Nord : Est ou Ouest)', () => {
  const resolved = resolveRouteGates(
    [
      { name: 'Saint-Selve', operator: 'ASF', lat: 44.66, lon: -0.45 },
      { name: 'Péage de Toulouse Nord', operator: 'ASF', lat: 43.66, lon: 1.43 },
    ],
    [],
    { knownGates: known },
  );

  it('retient la première candidate et conserve toutes les autres', () => {
    expect(resolved.gates).toEqual(['ASF:SAINT-SELVE', 'ASF:TOULOUSE-NORD/EST']);
    expect(resolved.alternatives['ASF:TOULOUSE-NORD/EST']).toEqual([
      'ASF:TOULOUSE-NORD/EST',
      'ASF:TOULOUSE-NORD/OUEST',
    ]);
    expect(resolved.warnings[0]).toContain('ambiguë');
  });

  it('le péage est la moyenne des candidates (22,90 € et 22,20 € → 22,55 €), marqué estimé', () => {
    const t = computeTripTolls(resolved.gates, {
      ...ctx,
      uncertainGates: new Set(resolved.uncertain),
      alternatives: new Map(Object.entries(resolved.alternatives)),
    });
    expect(t.charges[0]?.amountEur).toBe(22.55);
    expect(t.charges[0]?.source).toBe('estimate');
  });

  it('sans les alternatives, le premier couple est compté comme officiel (comportement d’avant)', () => {
    const t = computeTripTolls(resolved.gates, ctx);
    expect(t.charges[0]?.amountEur).toBe(22.9);
    expect(t.charges[0]?.source).toBe('official');
  });

  it('une correspondance manuelle à plusieurs gares est aussi traitée comme ambiguë', () => {
    const r = resolveRouteGates(
      [{ name: 'Péage de Toulouse Nord', operator: 'ASF', lat: 43.66, lon: 1.43 }],
      [
        {
          names: ['Péage de Toulouse Nord'],
          gates: ['ASF:TOULOUSE-NORD/EST', 'ASF:TOULOUSE-NORD/OUEST'],
        },
      ],
    );
    expect(r.uncertain).toEqual(['ASF:TOULOUSE-NORD/EST']);
    expect(r.alternatives['ASF:TOULOUSE-NORD/EST']).toHaveLength(2);
  });
});

describe('gare de frontière entre deux réseaux (séquence)', () => {
  const mappings: GateMapping[] = [
    { names: ['Péage de Saint-Arnoult'], gates: ['COFIROUTE:PARIS (LA FOLIE BESSIN)'] },
    {
      names: ['Péage de Corzé-Angers'],
      gates: ['COFIROUTE:ANGERS (CORZE)'],
      // Sortie du réseau Cofiroute puis entrée du réseau ASF.
      sequence: ['COFIROUTE:ANGERS (CORZE)', 'ASF:CORZE'],
    },
    { names: ['Péage de Nantes'], gates: ['ASF:NANTES'] },
  ];

  it('une gare de frontière compte comme sortie d’un réseau et entrée du suivant', () => {
    const r = resolveRouteGates(
      [
        { name: 'Péage de Saint-Arnoult', lat: 48.5, lon: 1.9 },
        { name: 'Péage de Corzé-Angers', lat: 47.5, lon: -0.5 },
        { name: 'Péage de Nantes', lat: 47.2, lon: -1.5 },
      ],
      mappings,
    );
    expect(r.gates).toEqual([
      'COFIROUTE:PARIS (LA FOLIE BESSIN)',
      'COFIROUTE:ANGERS (CORZE)',
      'ASF:CORZE',
      'ASF:NANTES',
    ]);
  });

  it('chaque réseau est facturé séparément : 32,90 € + 10,40 € = 43,30 €', () => {
    const t = computeTripTolls(
      ['COFIROUTE:PARIS (LA FOLIE BESSIN)', 'COFIROUTE:ANGERS (CORZE)', 'ASF:CORZE', 'ASF:NANTES'],
      ctx,
    );
    expect(t.charges.map((c) => c.amountEur)).toEqual([32.9, 10.4]);
    expect(t.charges.reduce((s, c) => s + c.amountEur, 0)).toBeCloseTo(43.3, 10);
    expect(t.warnings).toEqual([]);
  });
});
