import { describe, expect, it } from 'vitest';
import { TollBook } from './book';
import { OPEN_TOLLS, openTollPrice } from './open-tolls';
import { computeTripTolls } from './trip-tolls';
import type { PricePair } from './types';

function pair(from: string, to: string, c1: number): PricePair {
  const concession = from.split(':')[0] as PricePair['concession'];
  return {
    concession,
    from,
    to,
    distanceKm: null,
    prices: { 1: c1, 2: c1 * 1.5, 3: c1 * 2, 4: c1 * 3, 5: c1 / 2 },
  };
}

const book = new TollBook([
  pair('APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS', 41.3),
  pair('ASF:VIENNE', 'ASF:LANCON', 28.1),
  pair('SANEF:PARIS / ROISSY (PEAGE DE CHAMANT)', 'SANEF:LILLE / DOURGES (PEAGE DE FRESNES)', 18.9),
  pair('SANEF:SENLIS N°8', 'SANEF:LILLE / DOURGES (PEAGE DE FRESNES)', 14.6),
]);
const ctx = { book, openTolls: OPEN_TOLLS, vehicleClass: 1 as const, date: new Date('2026-11-09') };

describe('TollBook', () => {
  it('trouve le prix dans le sens inverse (grille symétrique)', () => {
    expect(book.priceBetween('ASF:LANCON', 'ASF:VIENNE', 1)).toBe(28.1);
  });

  it('renvoie undefined pour un couple inconnu', () => {
    expect(book.priceBetween('ASF:VIENNE', 'ASF:ORANGE', 1)).toBeUndefined();
  });
});

describe('computeTripTolls', () => {
  it('T01 : un seul réseau, entrée → sortie', () => {
    const r = computeTripTolls(['APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS'], ctx);
    expect(r.charges).toHaveLength(1);
    expect(r.charges[0]?.amountEur).toBe(41.3);
    expect(r.charges[0]?.source).toBe('official');
    expect(r.warnings).toEqual([]);
  });

  it('T07 : plusieurs réseaux à la suite, un péage par réseau', () => {
    const r = computeTripTolls(
      ['APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS', 'ASF:VIENNE', 'ASF:LANCON'],
      ctx,
    );
    expect(r.charges.map((c) => c.amountEur)).toEqual([41.3, 28.1]);
    expect(r.charges.reduce((s, c) => s + c.amountEur, 0)).toBeCloseTo(69.4, 10);
  });

  it('T02 : la bonne gare (Chamant) donne 18,90 €, pas 14,60 € (piège Senlis)', () => {
    const good = computeTripTolls(
      ['SANEF:PARIS / ROISSY (PEAGE DE CHAMANT)', 'SANEF:LILLE / DOURGES (PEAGE DE FRESNES)'],
      ctx,
    );
    expect(good.charges[0]?.amountEur).toBe(18.9);
    const wrong = computeTripTolls(
      ['SANEF:SENLIS N°8', 'SANEF:LILLE / DOURGES (PEAGE DE FRESNES)'],
      ctx,
    );
    expect(wrong.charges[0]?.amountEur).toBe(14.6);
  });

  it('T10 : le pont de Normandie est un péage à l’unité (6,10 €)', () => {
    const r = computeTripTolls(['OUVRAGE:PONT DE NORMANDIE'], ctx);
    expect(r.charges).toHaveLength(1);
    expect(r.charges[0]?.amountEur).toBe(6.1);
    expect(r.warnings).toEqual([]);
  });

  it('T09 : Millau dépend de la saison (11,30 € hors été, 13,80 € en été)', () => {
    const winter = computeTripTolls(['OUVRAGE:VIADUC DE MILLAU'], ctx);
    const summer = computeTripTolls(['OUVRAGE:VIADUC DE MILLAU'], {
      ...ctx,
      date: new Date('2026-07-20'),
    });
    expect(winter.charges[0]?.amountEur).toBe(11.3);
    expect(summer.charges[0]?.amountEur).toBe(13.8);
  });

  it('ouvrage au milieu d’un trajet autoroutier : péages séparés', () => {
    const r = computeTripTolls(['ASF:VIENNE', 'OUVRAGE:VIADUC DE MILLAU', 'ASF:LANCON'], ctx);
    // Vienne et Lançon sont isolées de part et d'autre du viaduc : pas de prix deviné.
    expect(r.charges.map((c) => c.id)).toEqual(['OUVRAGE:VIADUC DE MILLAU']);
    expect(r.warnings).toHaveLength(2);
  });

  it('signale une gare isolée au lieu de deviner un prix', () => {
    const r = computeTripTolls(['ASF:VIENNE'], ctx);
    expect(r.charges).toEqual([]);
    expect(r.warnings[0]).toContain('Gare isolée');
  });

  it('signale un couple sans tarif', () => {
    const r = computeTripTolls(['ASF:VIENNE', 'ASF:ORANGE'], ctx);
    expect(r.charges).toEqual([]);
    expect(r.warnings[0]).toContain('Aucun tarif');
  });

  it('utilise la classe de véhicule demandée', () => {
    const r = computeTripTolls(['ASF:VIENNE', 'ASF:LANCON'], { ...ctx, vehicleClass: 2 });
    expect(r.charges[0]?.amountEur).toBeCloseTo(42.15, 2);
  });

  it('sans gare, aucun péage', () => {
    expect(computeTripTolls([], ctx)).toEqual({ charges: [], warnings: [] });
  });
});

describe('openTollPrice', () => {
  const millau = OPEN_TOLLS.find((t) => t.gate === 'OUVRAGE:VIADUC DE MILLAU');

  it('applique les bornes de saison (15 juin et 15 septembre inclus)', () => {
    if (!millau) throw new Error('Millau absent');
    expect(openTollPrice(millau, new Date('2026-06-14'), 1)).toBe(11.3);
    expect(openTollPrice(millau, new Date('2026-06-15'), 1)).toBe(13.8);
    expect(openTollPrice(millau, new Date('2026-09-15'), 1)).toBe(13.8);
    expect(openTollPrice(millau, new Date('2026-09-16'), 1)).toBe(11.3);
  });
});
