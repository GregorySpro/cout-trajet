import { describe, expect, it } from 'vitest';
import { importAdemeLines, normalizeAdemeLine, toVehicleConsumption } from './ademe';

// Extraits réels de l'API ADEME « Car Labelling » (2026-11-09), champs utiles seulement.
const KANGOO = {
  Marque: 'RENAULT',
  Modèle: 'KANGOO',
  Libellé_modèle: 'KANGOO',
  Description_Commerciale: 'KANGOO (130ch)',
  Energie: 'ESSENCE',
  Type_de_boite: 'AUTOMATIQUE',
  Puissance_maximale: 96,
  Cylindrée: 1332,
  Prix_véhicule: 31000,
  Conso_basse_vitesse_Min: 8.461,
  Conso_basse_vitesse_Max: 9.02,
  Conso_moyenne_vitesse_Min: 6.372,
  Conso_moyenne_vitesse_Max: 7.204,
  Conso_haute_vitesse_Min: 5.681,
  Conso_haute_vitesse_Max: 6.695,
  'Conso_T-haute_vitesse_Min': 6.99,
  'Conso_T-haute_vitesse_Max': 8.845,
  Conso_vitesse_mixte_Min: 6.656,
  Conso_vitesse_mixte_Max: 7.871,
  CO2_vitesse_mixte_Min: 150.86,
  CO2_vitesse_mixte_Max: 178.42,
};

const MX30_ELECTRIC = {
  Marque: 'MAZDA',
  Modèle: 'MX-30',
  Libellé_modèle: 'MX-30',
  Description_Commerciale: 'MX-30 e-SKYACTIV (145ch)',
  Energie: 'ELECTRIC',
  Prix_véhicule: 38510,
};

const BMW_MOJIBAKE = {
  Marque: 'B.M.W.',
  Modèle: '220',
  Libellé_modèle: 'SERIE 2',
  Description_Commerciale: '220i Gran CoupÃ©',
  Energie: 'ESSENCE',
  Type_de_boite: 'AUTOMATIQUE',
  Puissance_maximale: 131,
  Cylindrée: 1998,
  Conso_basse_vitesse_Min: 9.169,
  Conso_basse_vitesse_Max: 9.172,
  Conso_haute_vitesse_Min: 4.934,
  Conso_haute_vitesse_Max: 5.902,
  'Conso_T-haute_vitesse_Min': 5.446,
  'Conso_T-haute_vitesse_Max': 7.22,
  Conso_vitesse_mixte_Min: 5.902,
  Conso_vitesse_mixte_Max: 6.993,
};

describe('normalizeAdemeLine', () => {
  it('moyenne les bornes min/max de chaque phase WLTP', () => {
    const v = normalizeAdemeLine(KANGOO);
    expect(v?.l100.low).toBeCloseTo(8.7405, 4);
    expect(v?.l100.medium).toBeCloseTo(6.788, 3);
    expect(v?.l100.high).toBeCloseTo(6.188, 3);
    expect(v?.l100.extraHigh).toBeCloseTo(7.9175, 4);
    expect(v?.l100.mixed).toBeCloseTo(7.2635, 4);
  });

  it('décrit le véhicule', () => {
    const v = normalizeAdemeLine(KANGOO);
    expect(v).toMatchObject({
      brand: 'RENAULT',
      model: 'KANGOO',
      fuel: 'gasoline',
      hybrid: false,
      powerKw: 96,
      gearbox: 'AUTOMATIQUE',
      priceEur: 31000,
      source: 'ademe-car-labelling',
    });
    expect(v?.co2MixedGPerKm).toBeCloseTo(164.64, 2);
  });

  it('écarte l’électrique (hors MVP)', () => {
    expect(normalizeAdemeLine(MX30_ELECTRIC)).toBeNull();
  });

  it('répare l’encodage cassé (CoupÃ© → Coupé)', () => {
    const v = normalizeAdemeLine(BMW_MOJIBAKE);
    expect(v?.description).toBe('220i Gran Coupé');
  });

  it('accepte les hybrides non rechargeables et les rattache au bon carburant', () => {
    const hybrid = normalizeAdemeLine({ ...KANGOO, Energie: 'GAZ+ELEC HNR' });
    expect(hybrid).toMatchObject({ fuel: 'diesel', hybrid: true });
    const hybridPetrol = normalizeAdemeLine({ ...KANGOO, Energie: 'ESS+ELEC HNR' });
    expect(hybridPetrol).toMatchObject({ fuel: 'gasoline', hybrid: true });
  });

  it('écarte hybride rechargeable, éthanol et GPL', () => {
    for (const energy of ['ELEC+ESSENC HR', 'ELEC+GAZOLE HR', 'SUPERETHANOL', 'ESS+G.P.L.']) {
      expect(normalizeAdemeLine({ ...KANGOO, Energie: energy })).toBeNull();
    }
  });

  it('écarte une ligne sans consommation exploitable', () => {
    expect(
      normalizeAdemeLine({
        ...KANGOO,
        'Conso_T-haute_vitesse_Min': null,
        'Conso_T-haute_vitesse_Max': null,
      }),
    ).toBeNull();
    expect(
      normalizeAdemeLine({ ...KANGOO, Conso_basse_vitesse_Min: 0, Conso_basse_vitesse_Max: 0 }),
    ).toBeNull();
  });

  it('utilise la seule borne disponible quand l’autre manque', () => {
    const v = normalizeAdemeLine({ ...KANGOO, Conso_basse_vitesse_Min: undefined });
    expect(v?.l100.low).toBe(9.02);
  });
});

describe('toVehicleConsumption', () => {
  it('relie basse vitesse → ville, haute vitesse → route, très haute vitesse → autoroute', () => {
    const v = normalizeAdemeLine(KANGOO);
    if (!v) throw new Error('véhicule attendu');
    expect(toVehicleConsumption(v)).toEqual({
      urban: v.l100.low,
      rural: v.l100.high,
      motorway: v.l100.extraHigh,
    });
  });
});

describe('importAdemeLines', () => {
  it('compte les lignes écartées et dédoublonne', () => {
    const result = importAdemeLines([KANGOO, MX30_ELECTRIC, BMW_MOJIBAKE, KANGOO]);
    expect(result.vehicles).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it('produit des clés distinctes pour des versions différentes', () => {
    const other = { ...KANGOO, Description_Commerciale: 'KANGOO (100ch)' };
    const result = importAdemeLines([KANGOO, other]);
    expect(new Set(result.vehicles.map((v) => v.key)).size).toBe(2);
  });
});
