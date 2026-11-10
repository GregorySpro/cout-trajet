// MapLibre lance son travail de rendu dans un Web Worker : les fichiers du worker doivent être
// servis tels quels (le bundler ne sait pas les emballer). On les copie dans public/ (non versionné).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre');

mkdirSync(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(dist, file), join(target, file));
}
