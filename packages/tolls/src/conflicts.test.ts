import { describe, expect, it } from 'vitest';
import { TollBook } from './book';
import { OPEN_TOLLS } from './open-tolls';
import { computeTripTolls } from './trip-tolls';
import type { PricePair, PriceSource } from './types';

const src = (
  id: string,
  effectiveFrom: string | null,
  reliability: PriceSource['reliability'] = 'official',
): PriceSource => ({ id, label: `Source ${id}`, effectiveFrom, reliability });

function pair(c1: number, source?: PriceSource, to = 'ASF:B'): PricePair {
  return {
    concession: 'ASF',
    from: 'ASF:A',
    to,
    distanceKm: null,
    prices: { 1: c1, 2: c1 * 1.5, 3: c1 * 2.4, 4: c1 * 3.4, 5: c1 * 0.6 },
    ...(source ? { source } : {}),
  };
}

describe('TollBook — conflits entre sources', () => {
  it('même prix : pas de conflit, la source la plus récente est conservée pour la traçabilité', () => {
    const book = new TollBook([pair(10, src('ancienne', '2026-02-01'))]);
    book.add([pair(10, src('recente', '2026-06-01'))]);
    expect(book.conflicts).toEqual([]);
    expect(book.find('ASF:A', 'ASF:B')?.source?.id).toBe('recente');
  });

  it('prix différents : la source la plus RÉCENTE l’emporte', () => {
    const book = new TollBook([pair(10, src('fev', '2026-02-01'))]);
    book.add([pair(11, src('juin', '2026-06-01'))]);
    expect(book.priceBetween('ASF:A', 'ASF:B', 1)).toBe(11);
    expect(book.conflicts).toEqual([
      {
        from: 'ASF:A',
        to: 'ASF:B',
        kept: { sourceId: 'juin', class1Eur: 11 },
        dropped: { sourceId: 'fev', class1Eur: 10 },
        reason: 'newer',
      },
    ]);
  });

  it('l’ordre de chargement n’y change rien : la plus récente gagne dans les deux sens', () => {
    const book = new TollBook([pair(11, src('juin', '2026-06-01'))]);
    book.add([pair(10, src('fev', '2026-02-01'))]);
    expect(book.priceBetween('ASF:A', 'ASF:B', 1)).toBe(11);
    expect(book.conflicts[0]?.reason).toBe('newer');
  });

  it('à date égale ou inconnue, la source la plus FIABLE l’emporte (officiel > tiers)', () => {
    const book = new TollBook([pair(9, src('comparateur', null, 'third-party'))]);
    book.add([pair(10, src('concessionnaire', null, 'official'))]);
    expect(book.priceBetween('ASF:A', 'ASF:B', 1)).toBe(10);
    expect(book.conflicts[0]?.reason).toBe('more-reliable');
  });

  it('une date connue et différente prime sur la fiabilité (hausse en cours d’année)', () => {
    const book = new TollBook([pair(10, src('officiel', '2026-02-01', 'official'))]);
    book.add([pair(12, src('presse', '2026-09-01', 'third-party'))]);
    expect(book.priceBetween('ASF:A', 'ASF:B', 1)).toBe(12);
  });

  it('une source inconnue est la moins fiable', () => {
    const book = new TollBook([pair(10)]);
    book.add([pair(11, src('x', null, 'estimate'))]);
    expect(book.priceBetween('ASF:A', 'ASF:B', 1)).toBe(11);
    const reverse = new TollBook([pair(11, src('x', null, 'estimate'))]);
    reverse.add([pair(10)]);
    expect(reverse.priceBetween('ASF:A', 'ASF:B', 1)).toBe(11);
  });

  it('tout égal : le premier chargé est gardé et le désaccord est signalé', () => {
    const book = new TollBook([pair(10, src('a', '2026-02-01'))]);
    book.add([pair(11, src('b', '2026-02-01'))]);
    expect(book.priceBetween('ASF:A', 'ASF:B', 1)).toBe(10);
    expect(book.conflicts[0]?.reason).toBe('first-loaded');
  });

  it('ne mélange pas les couples différents', () => {
    const book = new TollBook([pair(10, src('a', '2026-02-01'), 'ASF:B')]);
    book.add([pair(20, src('b', '2026-06-01'), 'ASF:C')]);
    expect(book.size).toBe(2);
    expect(book.conflicts).toEqual([]);
  });
});

describe('provenance des péages calculés', () => {
  it('le péage porte le libellé du document dont il vient', () => {
    const book = new TollBook([pair(10, src('apr', '2026-02-01'))]);
    const t = computeTripTolls(['ASF:A', 'ASF:B'], {
      book,
      openTolls: OPEN_TOLLS,
      vehicleClass: 1,
      date: new Date('2026-11-09'),
    });
    expect(t.charges[0]?.provenance).toBe('Source apr');
  });

  it('un ouvrage à tarif fixe cite son site officiel et sa date', () => {
    const t = computeTripTolls(['OUVRAGE:PONT DE NORMANDIE'], {
      book: new TollBook(),
      openTolls: OPEN_TOLLS,
      vehicleClass: 1,
      date: new Date('2026-11-09'),
    });
    expect(t.charges[0]?.provenance).toContain('1er mai 2026');
  });

  it('le tarif des ponts de Normandie (1er mai 2026) est plus récent que les grilles de février', () => {
    const pont = OPEN_TOLLS.find((o) => o.gate === 'OUVRAGE:PONT DE NORMANDIE');
    expect(pont?.effectiveFrom).toBe('2026-05-01');
    expect((pont?.effectiveFrom ?? '') > '2026-02-01').toBe(true);
  });
});
