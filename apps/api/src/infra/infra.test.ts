import { describe, expect, it } from 'vitest';
import { TtlCache } from './cache';
import { simplifyLine } from './geometry';
import { QuotaGuard } from './quota';

describe('TtlCache', () => {
  it('rend la valeur avant l’expiration, puis plus rien', () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, 10, () => now);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    now = 999;
    expect(cache.get('a')).toBe(1);
    now = 1000;
    expect(cache.get('a')).toBeUndefined();
  });

  it('évince les plus anciennes entrées au-delà de la taille maximale', () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('réécrire une clé la rend la plus récente', () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(10);
  });
});

describe('QuotaGuard', () => {
  it('autorise tout tant que le quota est inconnu', () => {
    const q = new QuotaGuard(20);
    expect(q.canSpend(1, false)).toBe(true);
    expect(q.canSpend(1, true)).toBe(true);
  });

  it('refuse les appels facultatifs sous la réserve mais garde les essentiels', () => {
    const q = new QuotaGuard(20);
    q.update({ remaining: '21', resetEpochSec: null });
    expect(q.canSpend(1, false)).toBe(true); // 21 − 1 = 20 ≥ réserve
    q.update({ remaining: '20', resetEpochSec: null });
    expect(q.canSpend(1, false)).toBe(false);
    expect(q.canSpend(1, true)).toBe(true);
    q.update({ remaining: '0', resetEpochSec: null });
    expect(q.canSpend(1, true)).toBe(false);
  });

  it('reprend après la réinitialisation annoncée par le fournisseur', () => {
    let now = 1_000_000;
    const q = new QuotaGuard(20, () => now);
    q.markExhausted(1_000 + 60); // dans 60 s après l'époque 1000 s… passé : en ms 1 060 000
    expect(q.canSpend(1, true)).toBe(false);
    now = 1_060_000;
    expect(q.canSpend(1, true)).toBe(true);
  });

  it('expose un instantané lisible', () => {
    const q = new QuotaGuard();
    expect(q.snapshot()).toEqual({ remaining: null, resetAt: null });
    q.update({ remaining: '150', resetEpochSec: '1794304589' });
    expect(q.snapshot().remaining).toBe(150);
    expect(q.snapshot().resetAt).toBe(new Date(1794304589 * 1000).toISOString());
  });

  it('ignore des en-têtes illisibles', () => {
    const q = new QuotaGuard();
    q.update({ remaining: 'abc', resetEpochSec: null });
    expect(q.snapshot().remaining).toBeNull();
  });
});

describe('simplifyLine', () => {
  it('garde les extrémités et supprime les points alignés', () => {
    const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [2 + i * 0.001, 48]);
    const out = simplifyLine(line, 5);
    expect(out).toEqual([line[0], line[49]]);
  });

  it('garde un coude marqué', () => {
    const line: [number, number][] = [
      [2, 48],
      [2.01, 48],
      [2.02, 48.01], // coude de ≈ 1,1 km
      [2.03, 48.01],
    ];
    const out = simplifyLine(line, 30);
    expect(out).toContainEqual([2.01, 48]);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it('ne modifie pas un tracé trop court ou une tolérance nulle', () => {
    const line: [number, number][] = [
      [2, 48],
      [2.001, 48.001],
    ];
    expect(simplifyLine(line, 30)).toEqual(line);
    expect(simplifyLine([...line, [2.002, 48.002]], 0)).toHaveLength(3);
  });
});
