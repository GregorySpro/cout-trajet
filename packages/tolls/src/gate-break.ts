/**
 * Marqueur de rupture dans une suite de gares : les gares avant et après sont facturées séparément,
 * même si elles portent le même nom de réseau. Sert aux gares de frontière entre deux sous-réseaux
 * d'une même société (ex. Cofiroute : A11 Paris → Angers-Corzé, puis A11 Angers → Nantes).
 */
export const GATE_BREAK = '|';
