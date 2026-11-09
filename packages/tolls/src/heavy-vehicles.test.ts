import { describe, expect, it } from 'vitest';
import { TollBook } from './book';
import { OPEN_TOLLS, openTollPrice } from './open-tolls';
import { parseAprrText } from './parse-aprr';
import { computeTripTolls } from './trip-tolls';

// Extrait réel de la grille APRR 2026 (Fleury-en-Bière ↔ Villefranche-Limas), toutes classes.
const APRR = `
FLEURY-EN-BIERE VILLEFRANCHE-LIMAS 430,28 41,30 € 64,30 € 101,00 € 139,10 € 24,80 €
VILLEFRANCHE-LIMAS FLEURY-EN-BIERE 430,28 41,30 € 64,30 € 101,00 € 139,10 € 24,80 €
`;

describe('péages des poids lourds et autres classes (grille APRR, Paris → Lyon)', () => {
  const book = new TollBook(parseAprrText(APRR).pairs);
  const gates = ['APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS'];
  const price = (vehicleClass: 1 | 2 | 3 | 4 | 5) =>
    computeTripTolls(gates, {
      book,
      openTolls: OPEN_TOLLS,
      vehicleClass,
      date: new Date('2026-11-09'),
    }).charges[0]?.amountEur;

  it('classe 1 (voiture) 41,30 € ; classe 2 (camping-car haut) 64,30 €', () => {
    expect(price(1)).toBe(41.3);
    expect(price(2)).toBe(64.3);
  });

  it('classe 3 (porteur 2 essieux) 101,00 € ; classe 4 (articulé) 139,10 €', () => {
    expect(price(3)).toBe(101);
    expect(price(4)).toBe(139.1);
  });

  it('classe 5 (moto) 24,80 €', () => {
    expect(price(5)).toBe(24.8);
  });

  it('un camion paie plus de trois fois le prix d’une voiture sur cet axe', () => {
    expect(Number(price(4)) / Number(price(1))).toBeGreaterThan(3);
  });
});

describe('ouvrages à tarif fixe, toutes classes', () => {
  const find = (gate: string) => {
    const t = OPEN_TOLLS.find((o) => o.gate === gate);
    if (!t) throw new Error(`${gate} absent`);
    return t;
  };

  it('pont de Normandie : 6,10 € / 7,10 € / 7,60 € / 15,10 € ; moto gratuite', () => {
    const t = find('OUVRAGE:PONT DE NORMANDIE');
    const d = new Date('2026-11-09');
    expect([1, 2, 3, 4, 5].map((c) => openTollPrice(t, d, c as 1 | 2 | 3 | 4 | 5))).toEqual([
      6.1, 7.1, 7.6, 15.1, 0,
    ]);
  });

  it('viaduc de Millau : tarif saisonnier pour les classes 1 et 2, fixe pour les poids lourds', () => {
    const t = find('OUVRAGE:VIADUC DE MILLAU');
    const winter = new Date('2026-11-09');
    const summer = new Date('2026-07-20');
    expect(openTollPrice(t, winter, 2)).toBe(17);
    expect(openTollPrice(t, summer, 2)).toBe(20.7);
    expect(openTollPrice(t, winter, 3)).toBe(37.6);
    expect(openTollPrice(t, summer, 3)).toBe(37.6);
    expect(openTollPrice(t, winter, 4)).toBe(47.7);
  });
});
