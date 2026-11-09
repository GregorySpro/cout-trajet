export interface QuotaSnapshot {
  remaining: number | null;
  resetAt: string | null;
}

/**
 * Suit le quota restant d'un fournisseur gratuit (en-têtes `x-ratelimit-*`) pour ne jamais le
 * dépasser : les appels facultatifs (itinéraire alternatif) sont refusés quand il reste peu de requêtes,
 * ce qui garde une réserve pour les appels essentiels.
 */
export class QuotaGuard {
  private remaining: number | undefined;
  private resetAtMs: number | undefined;

  constructor(
    /** Requêtes gardées en réserve pour les appels essentiels. */
    private readonly reserve = 20,
    private readonly now: () => number = Date.now,
  ) {}

  /** Met à jour l'état à partir des en-têtes d'une réponse. */
  update(headers: { remaining?: string | null; resetEpochSec?: string | null }): void {
    const remaining = headers.remaining != null ? Number(headers.remaining) : Number.NaN;
    if (Number.isFinite(remaining)) this.remaining = remaining;
    const reset = headers.resetEpochSec != null ? Number(headers.resetEpochSec) : Number.NaN;
    if (Number.isFinite(reset)) this.resetAtMs = reset * 1000;
  }

  /** Le fournisseur a signalé un dépassement : plus rien jusqu'à la réinitialisation. */
  markExhausted(resetEpochSec?: number): void {
    this.remaining = 0;
    this.resetAtMs = resetEpochSec !== undefined ? resetEpochSec * 1000 : this.now() + 60 * 60_000;
  }

  /**
   * Peut-on dépenser `count` requêtes ? Un appel essentiel n'exige que d'en avoir assez ; un appel
   * facultatif doit aussi laisser la réserve intacte.
   */
  canSpend(count: number, essential: boolean): boolean {
    if (this.resetAtMs !== undefined && this.now() >= this.resetAtMs) {
      this.remaining = undefined; // la fenêtre est écoulée : on repart sans information
      this.resetAtMs = undefined;
    }
    if (this.remaining === undefined) return true;
    return essential ? this.remaining >= count : this.remaining - count >= this.reserve;
  }

  snapshot(): QuotaSnapshot {
    return {
      remaining: this.remaining ?? null,
      resetAt: this.resetAtMs !== undefined ? new Date(this.resetAtMs).toISOString() : null,
    };
  }
}
