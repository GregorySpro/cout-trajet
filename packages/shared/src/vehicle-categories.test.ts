import { describe, expect, it } from 'vitest';
import { DEFAULT_TOLL_CLASS, VEHICLE_CATEGORIES, isHeavyGoodsVehicle, tollClassFor } from './index';

describe('tollClassFor (classification officielle des péages)', () => {
  it('classe 1 : voiture (≤ 2 m, ≤ 3,5 t)', () => {
    expect(tollClassFor({ heightM: 1.5, maxWeightT: 2, axles: 2 })).toBe(1);
    expect(tollClassFor({ heightM: 2, maxWeightT: 3.5, axles: 2 })).toBe(1);
  });

  it('classe 2 : utilitaire ou camping-car haut (> 2 m et < 3 m, ≤ 3,5 t)', () => {
    expect(tollClassFor({ heightM: 2.8, maxWeightT: 3.5, axles: 2 })).toBe(2);
    expect(tollClassFor({ heightM: 2.01, maxWeightT: 3, axles: 2 })).toBe(2);
  });

  it('classe 3 : 2 essieux, PTAC > 3,5 t ou hauteur ≥ 3 m', () => {
    expect(tollClassFor({ heightM: 3.5, maxWeightT: 19, axles: 2 })).toBe(3);
    expect(tollClassFor({ heightM: 3, maxWeightT: 3, axles: 2 })).toBe(3);
    expect(tollClassFor({ heightM: 2.5, maxWeightT: 3.6, axles: 2 })).toBe(3);
  });

  it('classe 4 : plus de 2 essieux (ensemble articulé 40 t)', () => {
    expect(tollClassFor({ heightM: 4, maxWeightT: 40, axles: 5 })).toBe(4);
    expect(tollClassFor({ heightM: 3.8, maxWeightT: 26, axles: 3 })).toBe(4);
  });

  it('classe 5 : moto, quelles que soient les autres valeurs', () => {
    expect(tollClassFor({ heightM: 1.2, maxWeightT: 0.3, axles: 2, motorcycle: true })).toBe(5);
  });

  it('refuse des dimensions invalides', () => {
    expect(() => tollClassFor({ heightM: 0, maxWeightT: 2, axles: 2 })).toThrow(RangeError);
    expect(() => tollClassFor({ heightM: 2, maxWeightT: -1, axles: 2 })).toThrow(RangeError);
    expect(() => tollClassFor({ heightM: 2, maxWeightT: 2, axles: 0 })).toThrow(RangeError);
  });
});

describe('catégories de véhicules', () => {
  it('chaque catégorie a une classe de péage par défaut', () => {
    for (const c of VEHICLE_CATEGORIES) expect(DEFAULT_TOLL_CLASS[c]).toBeGreaterThanOrEqual(1);
  });

  it('seuls les camions sont des poids lourds', () => {
    expect(VEHICLE_CATEGORIES.filter(isHeavyGoodsVehicle)).toEqual([
      'hgv-rigid',
      'hgv-articulated',
    ]);
  });

  it('les classes par défaut suivent la classification', () => {
    expect(DEFAULT_TOLL_CLASS['hgv-rigid']).toBe(3);
    expect(DEFAULT_TOLL_CLASS['hgv-articulated']).toBe(4);
    expect(DEFAULT_TOLL_CLASS.motorcycle).toBe(5);
  });
});
