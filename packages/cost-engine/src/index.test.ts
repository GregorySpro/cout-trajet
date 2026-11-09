import { describe, expect, it } from 'vitest';
import { isVehicleClass } from '@cout-trajet/shared';
import { COST_ENGINE_VERSION, DEFAULT_VEHICLE_CLASS } from './index';

describe('cost-engine (socle)', () => {
  it('expose une version', () => {
    expect(COST_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('utilise la classe 1 par défaut, classe valide', () => {
    expect(DEFAULT_VEHICLE_CLASS).toBe(1);
    expect(isVehicleClass(DEFAULT_VEHICLE_CLASS)).toBe(true);
  });
});
