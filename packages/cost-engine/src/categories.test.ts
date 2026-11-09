import { describe, expect, it } from 'vitest';
import {
  HEAVY_MEAN_L100,
  configFor,
  defaultConsumption,
  defaultSpeeds,
  legalSpeedCaps,
  mandatoryBreakMin,
} from './categories';
import { DEFAULT_COST_CONFIG } from './config';
import { estimateTrip } from './estimate';

const motorway = (km: number) => [{ distanceKm: km, roadClass: 'motorway' as const }];

describe('paramètres par catégorie', () => {
  it('les camions ont la consommation moyenne du CNR (porteur 25,2 ; articulé 30,2)', () => {
    expect(HEAVY_MEAN_L100['hgv-rigid']).toBe(25.2);
    expect(defaultConsumption('hgv-articulated')?.rural).toBe(30.2);
  });

  it('les autres catégories n’ont pas de consommation par défaut', () => {
    for (const c of ['car', 'van', 'motorhome', 'motorcycle'] as const) {
      expect(defaultConsumption(c)).toBeUndefined();
    }
  });

  it('les camions roulent à 90 km/h sur autoroute, les voitures à 130', () => {
    expect(defaultSpeeds('hgv-articulated').motorwayKmh).toBe(90);
    expect(defaultSpeeds('car').motorwayKmh).toBe(130);
  });

  it('seuls les camions ont des plafonds légaux de vitesse', () => {
    expect(legalSpeedCaps('hgv-rigid')).toEqual({ motorway: 90, rural: 80, urban: 50 });
    expect(legalSpeedCaps('car')).toEqual({});
  });

  it('les camions utilisent leur propre configuration de consommation', () => {
    expect(configFor('hgv-rigid')).not.toBe(DEFAULT_COST_CONFIG);
    expect(configFor('car')).toBe(DEFAULT_COST_CONFIG);
  });
});

describe('mandatoryBreakMin', () => {
  it('45 minutes par tranche complète de 4 h 30 de conduite', () => {
    expect(mandatoryBreakMin(269)).toBe(0);
    expect(mandatoryBreakMin(270)).toBe(45);
    expect(mandatoryBreakMin(539)).toBe(45);
    expect(mandatoryBreakMin(540)).toBe(90);
  });
});

describe('estimateTrip — camions', () => {
  const base = { segments: motorway(450), fuelPriceEurPerL: 1.8 };

  it('un ensemble articulé n’a pas besoin de consommation : moyenne CNR par défaut', () => {
    const e = estimateTrip({ ...base, category: 'hgv-articulated' });
    expect(e.category).toBe('hgv-articulated');
    // 450 km à 90 km/h = 300 min de conduite, 1 pause de 45 min.
    expect(e.drivingMin).toBe(300);
    expect(e.breaksMin).toBe(45);
    expect(e.durationMin).toBe(345);
    // 30,2 L/100 × facteur(90 km/h, réf. 85) ≈ 31,7 L/100 → ≈ 142 L.
    expect(e.fuelLiters).toBeGreaterThan(135);
    expect(e.fuelLiters).toBeLessThan(150);
  });

  it('la vitesse choisie ne dépasse jamais le plafond légal du camion', () => {
    const e = estimateTrip({
      ...base,
      category: 'hgv-rigid',
      speeds: { motorwayKmh: 130 },
    });
    expect(e.drivingMin).toBe(300); // plafonné à 90 km/h
  });

  it('un camion consomme plus qu’une voiture sur le même trajet', () => {
    const truck = estimateTrip({ ...base, category: 'hgv-articulated' });
    const car = estimateTrip({ ...base, vehicle: { urban: 7, rural: 5 } });
    expect(truck.fuelLiters).toBeGreaterThan(car.fuelLiters * 3);
  });

  it('un camion plus léger consomme moins (porteur 19 t < articulé)', () => {
    const rigid = estimateTrip({ ...base, category: 'hgv-rigid' });
    const articulated = estimateTrip({ ...base, category: 'hgv-articulated' });
    expect(rigid.fuelLiters).toBeLessThan(articulated.fuelLiters);
  });

  it('accepte une consommation saisie par l’utilisateur', () => {
    const e = estimateTrip({
      ...base,
      category: 'hgv-articulated',
      vehicle: { urban: 40, rural: 28, motorway: 28 },
    });
    expect(e.fuelLiters).toBeCloseTo(((450 * 28) / 100) * 1.0484, 0);
  });

  it('peut désactiver les pauses réglementaires', () => {
    const e = estimateTrip({ ...base, category: 'hgv-articulated', includeBreaks: false });
    expect(e.breaksMin).toBe(0);
    expect(e.durationMin).toBe(e.drivingMin);
  });
});

describe('estimateTrip — autres catégories', () => {
  const base = { segments: motorway(300), fuelPriceEurPerL: 1.8 };

  it('exige une consommation pour une voiture, un utilitaire, un camping-car et une moto', () => {
    for (const category of ['car', 'van', 'motorhome', 'motorcycle'] as const) {
      expect(() => estimateTrip({ ...base, category })).toThrow('obligatoire');
    }
  });

  it('un camping-car avec consommation saisie roule comme une voiture (pas de pause imposée)', () => {
    const e = estimateTrip({
      ...base,
      category: 'motorhome',
      vehicle: { urban: 14, rural: 11, motorway: 12 },
    });
    expect(e.breaksMin).toBe(0);
    expect(e.drivingMin).toBe(138); // 300 km à 130 km/h
  });

  it('la catégorie par défaut est la voiture', () => {
    const e = estimateTrip({ ...base, vehicle: { urban: 7, rural: 5 } });
    expect(e.category).toBe('car');
  });
});

describe('estimateTrip — hors taxes (professionnels)', () => {
  const input = {
    segments: motorway(450),
    category: 'hgv-articulated' as const,
    fuelPriceEurPerL: 1.8,
    tolls: [{ id: 't', amountEur: 120, source: 'official' as const }],
  };

  it('divise carburant et péages par 1,2', () => {
    const ttc = estimateTrip(input);
    const ht = estimateTrip({ ...input, excludeVat: true });
    expect(ht.excludesVat).toBe(true);
    expect(ttc.excludesVat).toBe(false);
    expect(ht.fuelCostEur).toBeCloseTo(ttc.fuelCostEur / 1.2, 1);
    expect(ht.tollCostEur).toBe(100);
    expect(ht.totalCostEur).toBeCloseTo(ttc.totalCostEur / 1.2, 1);
  });

  it('ne change ni la distance ni la durée', () => {
    const ttc = estimateTrip(input);
    const ht = estimateTrip({ ...input, excludeVat: true });
    expect(ht.durationMin).toBe(ttc.durationMin);
    expect(ht.fuelLiters).toBe(ttc.fuelLiters);
  });
});
