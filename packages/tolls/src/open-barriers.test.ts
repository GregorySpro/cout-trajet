import { describe, expect, it } from 'vitest';
import { TollBook } from './book';
import { resolveRouteGates } from './gate-resolver';
import { OPEN_BARRIERS } from './open-barriers';
import { OPEN_TOLLS, openTollPrice, prepareOpenTolls } from './open-tolls';
import { computeTripTolls } from './trip-tolls';

const find = (gate: string) => {
  const t = OPEN_BARRIERS.find((o) => o.gate === gate);
  if (!t) throw new Error(`${gate} absent`);
  return t;
};
const date = new Date('2026-11-09');

describe('barrières à système ouvert APRR / AREA (février 2026)', () => {
  it('20 barrières : 13 APRR et 7 AREA', () => {
    expect(OPEN_BARRIERS).toHaveLength(20);
    expect(OPEN_BARRIERS.filter((o) => o.gate.startsWith('APRR:'))).toHaveLength(13);
    expect(OPEN_BARRIERS.filter((o) => o.gate.startsWith('AREA:'))).toHaveLength(7);
  });

  it('relevé exact de quelques lignes du document officiel', () => {
    const gerzat = find('APRR:GERZAT-VILLE');
    expect([1, 2, 3, 4, 5].map((c) => openTollPrice(gerzat, date, c as 1 | 2 | 3 | 4 | 5))).toEqual(
      [1.4, 1.7, 3.3, 3.4, 1.1],
    );
    expect(openTollPrice(find('APRR:DORDIVES'), date, 1)).toBe(6);
    expect(openTollPrice(find('APRR:LUSSE'), date, 4)).toBe(31.9); // tunnel Maurice-Lemaire
    expect(openTollPrice(find('AREA:CRUSEILLES EST/OUEST A41N'), date, 2)).toBe(14.9);
    expect(openTollPrice(find('AREA:LE CROZET'), date, 3)).toBe(10);
  });

  it('cohérence des tarifs : classe 5 ≤ classe 1 ≤ classe 2 ≤ classe 3 pour chaque barrière', () => {
    for (const b of OPEN_BARRIERS) {
      const p = b.prices;
      expect(p[5], b.gate).toBeLessThanOrEqual(p[1]);
      expect(p[1], b.gate).toBeLessThanOrEqual(p[2]);
      expect(p[2], b.gate).toBeLessThanOrEqual(p[3]);
      expect(p[3], b.gate).toBeLessThanOrEqual(p[4] + 1e-9);
    }
  });

  it('chaque barrière est datée du 1er février 2026 et cite sa source', () => {
    for (const b of OPEN_BARRIERS) {
      expect(b.effectiveFrom).toBe('2026-02-01');
      expect(b.source).toContain('système ouvert');
    }
  });

  it('les identifiants sont uniques', () => {
    const ids = OPEN_TOLLS.map((o) => o.gate);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('OPEN_TOLLS regroupe les ouvrages et les barrières', () => {
    expect(OPEN_TOLLS.some((o) => o.gate === 'OUVRAGE:PONT DE NORMANDIE')).toBe(true);
    expect(OPEN_TOLLS.some((o) => o.gate === 'APRR:GENAY')).toBe(true);
  });
});

describe('prepareOpenTolls', () => {
  it('écarte une barrière dont le nom est aussi une gare de grille (la grille est prioritaire)', () => {
    const closed = new Set(['APRR:VILLEFRANCHE-VILLE', 'APRR:FLEURY-EN-BIERE']);
    const p = prepareOpenTolls(closed);
    expect(p.dropped).toEqual(['APRR:VILLEFRANCHE-VILLE']);
    expect(p.openTolls.some((o) => o.gate === 'APRR:VILLEFRANCHE-VILLE')).toBe(false);
    expect(p.knownGates.has('APRR:GENAY')).toBe(true);
    expect(p.knownGates.has('APRR:FLEURY-EN-BIERE')).toBe(true);
  });

  it('sans collision, tout est conservé', () => {
    const p = prepareOpenTolls(new Set(['APRR:FLEURY-EN-BIERE']));
    expect(p.dropped).toEqual([]);
    expect(p.openTolls).toHaveLength(OPEN_TOLLS.length);
  });
});

describe('péage d’une barrière ouverte sur un itinéraire', () => {
  const prepared = prepareOpenTolls(new Set());

  it('« Genay » (A46, OpenStreetMap) est rapproché automatiquement de la barrière APRR et facturé 1,70 €', () => {
    const r = resolveRouteGates(
      [{ name: 'Péage de Genay', operator: 'APRR', lat: 45.9, lon: 4.85 }],
      [],
      { knownGates: prepared.knownGates },
    );
    expect(r.gates).toEqual(['APRR:GENAY']);
    const t = computeTripTolls(r.gates, {
      book: new TollBook(),
      openTolls: prepared.openTolls,
      vehicleClass: 1,
      date,
    });
    expect(t.charges).toHaveLength(1);
    expect(t.charges[0]?.amountEur).toBe(1.7);
    expect(t.charges[0]?.provenance).toContain('système ouvert');
    expect(t.warnings).toEqual([]);
  });

  it('deux barrières successives sont facturées chacune (Mionnay puis Genay sur l’A46)', () => {
    const t = computeTripTolls(['APRR:MIONNAY', 'APRR:GENAY'], {
      book: new TollBook(),
      openTolls: prepared.openTolls,
      vehicleClass: 1,
      date,
    });
    expect(t.charges.map((c) => c.amountEur)).toEqual([1, 1.7]);
  });

  it('un camion de 40 t (classe 4) paie le tarif de sa classe', () => {
    const t = computeTripTolls(['APRR:DORDIVES'], {
      book: new TollBook(),
      openTolls: prepared.openTolls,
      vehicleClass: 4,
      date,
    });
    expect(t.charges[0]?.amountEur).toBe(18.9);
  });
});
