/**
 * Répare un texte UTF-8 qui a été lu comme du Latin-1 (« CoupÃ© » → « Coupé »).
 * Constaté dans le champ `Description_Commerciale` de l'ADEME. Le texte déjà correct est renvoyé tel quel.
 */
export function fixMojibake(text: string): string {
  if (!/[ÃÂ]/.test(text)) return text;
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 255) return text; // pas du Latin-1 : ne pas toucher
    bytes[i] = code;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text; // séquence UTF-8 invalide : texte d'origine conservé
  }
}

/** Nombre fini ou `null`. */
export function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Moyenne de deux bornes (min, max) ; la seule borne présente sinon ; `null` si aucune. */
export function midpoint(min: unknown, max: unknown): number | null {
  const a = finiteOrNull(min);
  const b = finiteOrNull(max);
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}
