import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED_PROFILE } from './config';
import { effectiveSpeedKmh, segmentDurationMin } from './duration';

describe('effectiveSpeedKmh', () => {
  it('utilise la vitesse choisie pour la classe de route', () => {
    expect(
      effectiveSpeedKmh({ distanceKm: 10, roadClass: 'motorway' }, DEFAULT_SPEED_PROFILE),
    ).toBe(130);
    expect(effectiveSpeedKmh({ distanceKm: 10, roadClass: 'rural' }, DEFAULT_SPEED_PROFILE)).toBe(
      80,
    );
  });

  it('est plafonnée par la limite du tronçon', () => {
    const seg = { distanceKm: 10, roadClass: 'motorway', speedLimitKmh: 110 } as const;
    expect(effectiveSpeedKmh(seg, DEFAULT_SPEED_PROFILE)).toBe(110);
  });

  it('ne dépasse pas la vitesse choisie même si la limite est plus haute', () => {
    const seg = { distanceKm: 10, roadClass: 'rural', speedLimitKmh: 90 } as const;
    expect(effectiveSpeedKmh(seg, { ...DEFAULT_SPEED_PROFILE, ruralKmh: 70 })).toBe(70);
  });
});

describe('segmentDurationMin', () => {
  it('130 km à 130 km/h = 60 min', () => {
    expect(segmentDurationMin(130, 130)).toBeCloseTo(60, 10);
  });

  it('130 km à 110 km/h ≈ 70,9 min', () => {
    expect(segmentDurationMin(130, 110)).toBeCloseTo(70.909, 3);
  });
});
