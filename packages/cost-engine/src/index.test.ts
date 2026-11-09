import { describe, expect, it } from 'vitest';
import { COST_ENGINE_VERSION } from './index';

describe('cost-engine', () => {
  it('expose une version au format semver', () => {
    expect(COST_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
