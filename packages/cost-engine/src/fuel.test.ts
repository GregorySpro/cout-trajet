import { describe, expect, it } from 'vitest';
import { DEFAULT_COST_CONFIG } from './config';
import { baseConsumption, segmentFuelLiters, speedFactor } from './fuel';

describe('speedFactor', () => {
  it('vaut 1 à la vitesse de référence', () => {
    expect(speedFactor(110, 110, 0.5)).toBe(1);
  });

  it('augmente au-delà de la référence (≈ +20 % à 130 km/h sur autoroute)', () => {
    expect(speedFactor(130, 110, 0.5)).toBeCloseTo(0.5 + 0.5 * (130 / 110) ** 2, 10);
    expect(speedFactor(130, 110, 0.5)).toBeCloseTo(1.198, 3);
  });

  it('diminue en dessous de la référence (≈ −17 % à 90 km/h)', () => {
    expect(speedFactor(90, 110, 0.5)).toBeCloseTo(0.835, 3);
  });

  it('ne dépend pas de la vitesse quand la part aérodynamique est nulle', () => {
    expect(speedFactor(50, 30, 0)).toBe(1);
  });

  it('refuse une vitesse nulle ou négative', () => {
    expect(() => speedFactor(0, 110, 0.5)).toThrow(RangeError);
    expect(() => speedFactor(-10, 110, 0.5)).toThrow(RangeError);
  });
});

describe('baseConsumption', () => {
  const vehicle = { urban: 7, rural: 5 };

  it('utilise la conso urbaine et extra-urbaine telles quelles', () => {
    expect(baseConsumption(vehicle, 'urban', DEFAULT_COST_CONFIG)).toBe(7);
    expect(baseConsumption(vehicle, 'rural', DEFAULT_COST_CONFIG)).toBe(5);
  });

  it('dérive la conso autoroute de l’extra-urbaine quand elle est absente', () => {
    expect(baseConsumption(vehicle, 'motorway', DEFAULT_COST_CONFIG)).toBeCloseTo(5.5, 10);
  });

  it('utilise la conso autoroute fournie', () => {
    expect(baseConsumption({ ...vehicle, motorway: 6.2 }, 'motorway', DEFAULT_COST_CONFIG)).toBe(
      6.2,
    );
  });
});

describe('segmentFuelLiters', () => {
  const vehicle = { urban: 7, rural: 5 };

  it('100 km d’autoroute à 130 km/h : 5,5 L/100 × 1,198 ≈ 6,59 L', () => {
    const liters = segmentFuelLiters(100, 'motorway', 130, vehicle, DEFAULT_COST_CONFIG);
    expect(liters).toBeCloseTo(5.5 * speedFactor(130, 110, 0.5), 10);
    expect(liters).toBeCloseTo(6.59, 2);
  });

  it('100 km d’autoroute à 110 km/h : 5,5 L (référence)', () => {
    expect(segmentFuelLiters(100, 'motorway', 110, vehicle, DEFAULT_COST_CONFIG)).toBeCloseTo(
      5.5,
      10,
    );
  });

  it('rouler à 110 plutôt que 130 économise du carburant', () => {
    const at130 = segmentFuelLiters(200, 'motorway', 130, vehicle, DEFAULT_COST_CONFIG);
    const at110 = segmentFuelLiters(200, 'motorway', 110, vehicle, DEFAULT_COST_CONFIG);
    expect(at110).toBeLessThan(at130);
  });

  it('0 km = 0 L', () => {
    expect(segmentFuelLiters(0, 'rural', 80, vehicle, DEFAULT_COST_CONFIG)).toBe(0);
  });
});
