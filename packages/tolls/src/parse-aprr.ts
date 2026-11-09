import { gateId, normalizeGateName, parseFrenchNumber } from './normalize';
import type { ClassPrices, ParseResult, PricePair } from './types';

// Fin de ligne : distance tarifaire puis les prix des classes 1 à 5.
const TAIL =
  /\s(\d+,\d{2})\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s(\d+,\d{2}) €\s*$/;

interface Row {
  head: string;
  tail: string;
  numbers: number[];
}

/**
 * Lit le texte extrait de la grille PDF d'APRR/AREA.
 * Chaque ligne : « GARE_ENTREE GARE_SORTIE distance classe1 … classe5 ».
 * Les noms de gare contiennent des espaces : on retrouve la coupure entrée/sortie grâce à la
 * symétrie de la grille (la ligne inverse existe avec les mêmes chiffres), puis on lève les
 * ambiguïtés restantes avec le vocabulaire des gares déjà identifiées sans ambiguïté.
 */
export function parseAprrText(text: string, concession: 'APRR' | 'AREA' = 'APRR'): ParseResult {
  const warnings: string[] = [];
  const rows: Row[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = TAIL.exec(line);
    if (!m) continue;
    const head = line.slice(0, m.index).trim().replace(/\s+/g, ' ');
    if (head === '' || !head.includes(' ')) continue;
    rows.push({
      head,
      tail: m.slice(1).join('|'),
      numbers: m.slice(1).map(parseFrenchNumber),
    });
  }

  const tailByHead = new Map<string, string>();
  for (const r of rows) tailByHead.set(r.head, r.tail);

  const split = (head: string, k: number): [string, string] => {
    const words = head.split(' ');
    return [words.slice(0, k).join(' '), words.slice(k).join(' ')];
  };

  const candidates = (r: Row): number[] => {
    const n = r.head.split(' ').length;
    const out: number[] = [];
    for (let k = 1; k < n; k++) {
      const [a, b] = split(r.head, k);
      if (tailByHead.get(`${b} ${a}`) === r.tail) out.push(k);
    }
    return out;
  };

  // Passe 1 : lignes dont la coupure est unique ; on en tire le vocabulaire des gares.
  const resolved = new Map<Row, number>();
  const vocabulary = new Set<string>();
  const pending: Row[] = [];
  for (const r of rows) {
    const c = candidates(r);
    if (c.length === 1) {
      const k = c[0] as number;
      resolved.set(r, k);
      const [a, b] = split(r.head, k);
      vocabulary.add(a);
      vocabulary.add(b);
    } else {
      pending.push(r);
    }
  }

  // Passe 2 : lignes ambiguës, départagées par le vocabulaire.
  const unresolved: Row[] = [];
  for (const r of pending) {
    const n = r.head.split(' ').length;
    const ok: number[] = [];
    for (let k = 1; k < n; k++) {
      const [a, b] = split(r.head, k);
      if (vocabulary.has(a) && vocabulary.has(b)) ok.push(k);
    }
    if (ok.length === 1) resolved.set(r, ok[0] as number);
    else unresolved.push(r);
  }

  // Passe 3 : l'extraction du PDF coupe parfois un mot (« BESANCON ES T », « MONTLUE L »). On recolle
  // les lettres isolées au mot précédent et on accepte si les deux gares ainsi obtenues sont connues.
  const repairedNames = new Map<Row, [string, string]>();
  let skipped = 0;
  for (const r of unresolved) {
    const merged = r.head.replace(/(\S) ([A-Z])(?= |$)/g, '$1$2');
    const n = merged.split(' ').length;
    const ok: [string, string][] = [];
    for (let k = 1; k < n; k++) {
      const [a, b] = split(merged, k);
      if (vocabulary.has(a) && vocabulary.has(b)) ok.push([a, b]);
    }
    if (ok.length === 1) repairedNames.set(r, ok[0] as [string, string]);
    else skipped++;
  }
  if (skipped > 0)
    warnings.push(`${skipped} ligne(s) dont la coupure entrée/sortie est ambiguë ignorée(s).`);

  const toPair = (r: Row, a: string, b: string): PricePair => {
    const [distance, c1, c2, c3, c4, c5] = r.numbers as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const prices: ClassPrices = { 1: c1, 2: c2, 3: c3, 4: c4, 5: c5 };
    return {
      concession,
      from: gateId(concession, normalizeGateName(a)),
      to: gateId(concession, normalizeGateName(b)),
      distanceKm: distance,
      prices,
    };
  };

  const pairs: PricePair[] = [];
  for (const [r, k] of resolved) {
    const [a, b] = split(r.head, k);
    pairs.push(toPair(r, a, b));
  }
  for (const [r, [a, b]] of repairedNames) pairs.push(toPair(r, a, b));
  return { pairs, warnings };
}
