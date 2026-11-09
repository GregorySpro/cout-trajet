import { describe, expect, it } from 'vitest';
import { isVehicleClass } from './index';

describe('isVehicleClass', () => {
  it('accepte les classes 1 à 5', () => {
    for (const c of [1, 2, 3, 4, 5]) expect(isVehicleClass(c)).toBe(true);
  });

  it('refuse les autres valeurs', () => {
    for (const c of [0, 6, -1, 1.5]) expect(isVehicleClass(c)).toBe(false);
  });
});
