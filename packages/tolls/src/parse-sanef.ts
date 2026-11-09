import { gateId, parseFrenchNumber } from './normalize';
import type { ClassPrices, ParseResult, PricePair } from './types';

interface SanefRow {
  label: string;
  values: number[];
}

const ROW = /^((?:\d+,\d+\s+)*)(\p{Lu}.*)$/u;
const CLASSES = [1, 2, 3, 4, 5] as const;

/**
 * Lit le texte extrait de la brochure PDF de Sanef (matrices triangulaires).
 * Le texte doit contenir des marqueurs `=====PAGE n=====` ; la page 2 est la classe 1, la page 3 la
 * classe 2, etc. Dans une section, la ligne d'indice i porte i prix vers les gares précédentes.
 * Les sections dont les lignes n'ont pas la bonne longueur (mise en page brouillée) sont rejetées
 * avec un avertissement plutôt que lues de travers.
 */
export function parseSanefText(text: string): ParseResult {
  const warnings: string[] = [];
  const pages = text.split(/=====PAGE (\d+)=====/);
  // pages = [avant, "1", texte1, "2", texte2, …]
  const merged = new Map<string, { from: string; to: string; prices: Partial<ClassPrices> }>();

  for (let p = 1; p < pages.length; p += 2) {
    const pageNo = Number(pages[p]);
    const pageText = pages[p + 1] ?? '';
    const cls = CLASSES[pageNo - 2];
    if (cls === undefined) continue; // couverture ou page hors tarifs

    const sections: SanefRow[][] = [];
    let current: SanefRow[] | null = null;
    for (const raw of pageText.split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '' || line.startsWith('TARIFS DE PEAGE')) continue;
      if (line.startsWith('(') && current && current.length > 0) {
        const last = current[current.length - 1] as SanefRow;
        last.label += ` ${line}`;
        continue;
      }
      const m = ROW.exec(line);
      if (!m) continue;
      const values = (m[1] ?? '').split(/\s+/).filter(Boolean).map(parseFrenchNumber);
      const label = (m[2] ?? '').trim();
      if (values.length === 0) {
        current = [{ label, values }];
        sections.push(current);
      } else if (current) {
        current.push({ label, values });
      }
    }

    for (const section of sections) {
      if (section.length < 3) continue; // légendes et lignes isolées
      const valid = section.every((row, i) => row.values.length === i);
      if (!valid) {
        warnings.push(
          `Page ${pageNo} : section « ${section[0]?.label.slice(0, 40)} » rejetée (mise en page non lisible).`,
        );
        continue;
      }
      section.forEach((row, i) => {
        row.values.forEach((price, j) => {
          const other = section[j] as SanefRow;
          const key = `${row.label}|${other.label}`;
          const entry = merged.get(key) ?? { from: row.label, to: other.label, prices: {} };
          entry.prices[cls] = price;
          merged.set(key, entry);
        });
        void i;
      });
    }
  }

  const pairs: PricePair[] = [];
  let incomplete = 0;
  for (const { from, to, prices } of merged.values()) {
    if (CLASSES.every((c) => prices[c] !== undefined)) {
      pairs.push({
        concession: 'SANEF',
        from: gateId('SANEF', from),
        to: gateId('SANEF', to),
        distanceKm: null,
        prices: prices as ClassPrices,
      });
    } else {
      incomplete++;
    }
  }
  if (incomplete > 0)
    warnings.push(`${incomplete} couple(s) de gares sans les 5 classes ignoré(s).`);
  return { pairs, warnings };
}
