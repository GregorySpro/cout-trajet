import type { GateMapping } from './gate-resolver';

const CHAMANT = 'SANEF:PARIS / ROISSY (PEAGE DE CHAMANT)';

/**
 * Correspondances validées sur les trajets de référence (spikes S1/S3, 2026-11-09).
 * Chaque ligne indique comment le nom d'une gare OpenStreetMap se traduit en gare de grille.
 * À compléter et contrôler gare par gare ; voir docs/spikes/S1-S2-apis-externes.md.
 */
export const GATE_MAPPINGS: readonly GateMapping[] = [
  // T01 Paris → Lyon (APRR)
  { names: ['Péage de Fleury-en-Bière'], gates: ['APRR:FLEURY-EN-BIERE'] },
  { names: ['Péage de Villefranche-Limas'], gates: ['APRR:VILLEFRANCHE-LIMAS'] },

  // T02 Paris → Lille (Sanef). Le nœud « Senlis » situé à la barrière de Chamant est Chamant,
  // pas la sortie « Senlis N°8 » : l'ancrage géographique évite l'erreur de −23 % (14,60 € au lieu de 18,90 €).
  { names: ['Péage de Chamant'], gates: [CHAMANT] },
  { names: ['Senlis'], at: { lat: 49.2158, lon: 2.628, radiusM: 300 }, gates: [CHAMANT] },
  { names: ['Péage de Fresnes'], gates: ['SANEF:LILLE / DOURGES (PEAGE DE FRESNES)'] },

  // T03 Lyon → Marseille (ASF)
  { names: ['Péage de Vienne'], gates: ['ASF:VIENNE'] },
  { names: ['Péage de Lançon'], gates: ['ASF:LANCON'] },

  // T04 Bordeaux → Toulouse (ASF). « Toulouse Nord » existe en Est et en Ouest (22,90 € / 22,20 €).
  { names: ['Saint-Selve'], gates: ['ASF:SAINT-SELVE'] },
  {
    names: ['Péage de Toulouse Nord'],
    gates: ['ASF:TOULOUSE-NORD/EST', 'ASF:TOULOUSE-NORD/OUEST'],
  },

  // T09 / T10 : péages à l'unité
  { names: ['Péage viaduc de Millau'], gates: ['OUVRAGE:VIADUC DE MILLAU'] },
  { names: ['Pont de Normandie'], gates: ['OUVRAGE:PONT DE NORMANDIE'] },

  // Trajets inconnus U1/U2 (validation de P2, passe 2). Ces deux correspondances ne sont pas
  // évidentes par le nom, elles ont été contrôlées par les prix de référence de Vinci :
  //  - la barrière de Saint-Arnoult est l'entrée « Paris (La Folie-Bessin) » des grilles Cofiroute
  //    (→ Orléans-nord 12,00 € ; → Tours centre (Monnaie) 26,00 € ; → Angers (Corzé) 32,90 € : les trois
  //    prix correspondent au PDF « principales liaisons »).
  { names: ['Péage de Saint-Arnoult'], gates: ['COFIROUTE:PARIS (LA FOLIE BESSIN)'] },
  { names: ['Péage de Monnaie'], gates: ['COFIROUTE:TOURS CENTRE (MONNAIE)'] },
];
