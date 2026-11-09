import {
  FuelPriceTable,
  fetchFuelPrices,
  type FetchLike,
  type FuelPriceSnapshot,
} from '@cout-trajet/reference-data';

export interface FuelPriceInfo {
  table: FuelPriceTable;
  fetchedAt: string;
  /** Vrai si le dernier rafraîchissement a échoué et qu'on réutilise un ancien relevé. */
  stale: boolean;
}

export interface FuelPriceSource {
  get(): Promise<FuelPriceInfo | undefined>;
}

/**
 * Prix des carburants avec rafraîchissement paresseux : au plus une récupération toutes les
 * `ttlMs`. Si le service public est en panne, le dernier relevé valide reste utilisé (marqué périmé).
 */
export class CachedFuelPrices implements FuelPriceSource {
  private current: { snapshot: FuelPriceSnapshot; fetchedAtMs: number } | undefined;
  private inflight: Promise<void> | undefined;
  private lastFailure = false;

  constructor(
    private readonly fetchFn: FetchLike,
    private readonly ttlMs = 6 * 60 * 60_000,
    private readonly now: () => number = Date.now,
    initial?: { snapshot: FuelPriceSnapshot; fetchedAt: string },
  ) {
    if (initial) {
      this.current = { snapshot: initial.snapshot, fetchedAtMs: Date.parse(initial.fetchedAt) };
    }
  }

  async get(): Promise<FuelPriceInfo | undefined> {
    const expired = !this.current || this.now() - this.current.fetchedAtMs >= this.ttlMs;
    if (expired) {
      this.inflight ??= this.refresh().finally(() => {
        this.inflight = undefined;
      });
      await this.inflight;
    }
    if (!this.current) return undefined;
    return {
      table: new FuelPriceTable([
        ...this.current.snapshot.national,
        ...this.current.snapshot.departments,
      ]),
      fetchedAt: new Date(this.current.fetchedAtMs).toISOString(),
      stale: this.lastFailure,
    };
  }

  private async refresh(): Promise<void> {
    try {
      const snapshot = await fetchFuelPrices(this.fetchFn);
      if (snapshot.national.length === 0) throw new Error('relevé national vide');
      this.current = { snapshot, fetchedAtMs: this.now() };
      this.lastFailure = false;
    } catch {
      this.lastFailure = true; // on garde l'ancien relevé s'il existe
    }
  }
}
