import { describe, expect, it } from 'vitest';
import { GATE_MAPPINGS } from './gate-mapping';
import { resolveRouteGates } from './gate-resolver';

describe('resolveRouteGates', () => {
  it('traduit les noms OpenStreetMap en gares de grille', () => {
    const r = resolveRouteGates(
      [
        { name: 'Péage de Fleury-en-Bière', lat: 48.4259, lon: 2.5404 },
        { name: 'Péage de Villefranche-Limas', lat: 45.973, lon: 4.7329 },
      ],
      GATE_MAPPINGS,
    );
    expect(r.gates).toEqual(['APRR:FLEURY-EN-BIERE', 'APRR:VILLEFRANCHE-LIMAS']);
    expect(r.warnings).toEqual([]);
  });

  it('fusionne les nœuds multiples d’une même gare (plusieurs voies)', () => {
    const r = resolveRouteGates(
      [
        { name: 'Péage de Fleury-en-Bière', lat: 48.42591, lon: 2.54044 },
        { name: 'Péage de Fleury-en-Bière', lat: 48.42583, lon: 2.5398 },
      ],
      GATE_MAPPINGS,
    );
    expect(r.gates).toEqual(['APRR:FLEURY-EN-BIERE']);
  });

  describe('piège Senlis / Chamant (T02)', () => {
    it('le nœud « Senlis » posé sur la barrière de Chamant devient Chamant', () => {
      const r = resolveRouteGates(
        [
          { name: 'Senlis', lat: 49.216, lon: 2.62749 },
          { name: 'Péage de Fresnes', lat: 50.32505, lon: 2.9107 },
        ],
        GATE_MAPPINGS,
      );
      expect(r.gates).toEqual([
        'SANEF:PARIS / ROISSY (PEAGE DE CHAMANT)',
        'SANEF:LILLE / DOURGES (PEAGE DE FRESNES)',
      ]);
    });

    it('le nœud « Senlis » de la sortie n°8 (≈ 1,2 km) n’est pas pris pour Chamant', () => {
      const r = resolveRouteGates([{ name: 'Senlis', lat: 49.2071, lon: 2.60955 }], GATE_MAPPINGS);
      expect(r.gates).toEqual([]);
      expect(r.warnings[0]).toContain('sans correspondance');
    });
  });

  it('signale une gare ambiguë (Toulouse Nord Est/Ouest) et retient la première', () => {
    const r = resolveRouteGates(
      [{ name: 'Péage de Toulouse Nord', lat: 43.65779, lon: 1.4262 }],
      GATE_MAPPINGS,
    );
    expect(r.gates).toEqual(['ASF:TOULOUSE-NORD/EST']);
    expect(r.warnings[0]).toContain('ambiguë');
    expect(r.warnings[0]).toContain('ASF:TOULOUSE-NORD/OUEST');
  });

  it('signale une gare inconnue au lieu de la deviner', () => {
    const r = resolveRouteGates([{ name: 'Gare inconnue', lat: 45, lon: 3 }], GATE_MAPPINGS);
    expect(r.gates).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it('ignore les différences d’accents et de casse', () => {
    const r = resolveRouteGates([{ name: 'PEAGE DE LANCON', lat: 43.6, lon: 5.1 }], GATE_MAPPINGS);
    expect(r.gates).toEqual(['ASF:LANCON']);
  });
});
