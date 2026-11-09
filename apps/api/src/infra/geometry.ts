import type { LonLat } from '@cout-trajet/tolls';

const M_PER_DEG_LAT = 110_540;

/**
 * Simplifie un tracé (algorithme de Ramer-Douglas-Peucker, version itérative) en gardant les points
 * qui s'écartent de plus de `toleranceM` mètres du tracé simplifié. Garde toujours le premier et le dernier.
 */
export function simplifyLine(points: readonly LonLat[], toleranceM: number): LonLat[] {
  if (points.length <= 2 || !(toleranceM > 0)) return [...points];
  const meanLat = points.reduce((s, p) => s + p[1], 0) / points.length;
  const kx = 111_320 * Math.cos((meanLat * Math.PI) / 180);
  const xy = points.map((p) => [p[0] * kx, p[1] * M_PER_DEG_LAT] as const);

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    const a = xy[start] as readonly [number, number];
    const b = xy[end] as readonly [number, number];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const p = xy[i] as readonly [number, number];
      const t =
        len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
