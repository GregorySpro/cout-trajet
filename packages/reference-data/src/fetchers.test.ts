import { describe, expect, it } from 'vitest';
import { fetchAdemeLines, fetchFuelPrices, type FetchLike } from './fetchers';

function fakeFetch(pages: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    // Clé la plus longue qui correspond (les URL de page suivante partagent le même préfixe).
    const key = Object.keys(pages)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => pages[key] };
  };
}

const BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/ademe-car-labelling/lines';

describe('fetchAdemeLines', () => {
  it('suit la pagination jusqu’à la dernière page', async () => {
    const calls: string[] = [];
    const fetchFn = fakeFetch(
      {
        [`${BASE}?size=2`]: { results: [{ a: 1 }, { a: 2 }], next: `${BASE}?size=2&after=2` },
        [`${BASE}?size=2&after=2`]: { results: [{ a: 3 }] },
      },
      calls,
    );
    const lines = await fetchAdemeLines(fetchFn, { pageSize: 2 });
    expect(lines).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(calls).toHaveLength(2);
  });

  it('ne demande que les champs utiles (select)', async () => {
    const calls: string[] = [];
    await fetchAdemeLines(fakeFetch({ [BASE]: { results: [] } }, calls));
    expect(decodeURIComponent(calls[0] ?? '')).toContain('select=Marque,Modèle');
  });

  it('refuse un lien de pagination hors de data.ademe.fr', async () => {
    const fetchFn = fakeFetch({
      [BASE]: { results: [{ a: 1 }], next: 'https://exemple.invalid/vol?x=1' },
    });
    await expect(fetchAdemeLines(fetchFn)).rejects.toThrow('origine inattendue');
  });

  it('s’arrête au nombre maximal de pages', async () => {
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ a: 1 }], next: `${BASE}?size=1&after=1` }),
    });
    const lines = await fetchAdemeLines(fetchFn, { pageSize: 1, maxPages: 3 });
    expect(lines).toHaveLength(3);
  });

  it('signale une erreur HTTP', async () => {
    await expect(fetchAdemeLines(fakeFetch({}))).rejects.toThrow('HTTP 404');
  });
});

describe('fetchFuelPrices', () => {
  it('envoie 2 requêtes d’agrégation et assemble le résultat', async () => {
    const calls: string[] = [];
    const base =
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      const national = new URL(url).searchParams.get('limit') === '1';
      return {
        ok: true,
        status: 200,
        json: async () =>
          national
            ? { results: [{ gazole_avg: 2.2, gazole_n: 10 }] }
            : { results: [{ code_departement: '75', gazole_avg: 2.3, gazole_n: 5 }] },
      };
    };
    const snapshot = await fetchFuelPrices(fetchFn);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.startsWith(base))).toBe(true);
    expect(snapshot.national[0]?.scope).toBe('FR');
    expect(snapshot.departments[0]).toMatchObject({ scope: '75', avgEurPerL: 2.3 });
  });
});
