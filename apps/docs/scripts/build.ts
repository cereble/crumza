import { rmSync } from 'node:fs';
import { build } from 'esbuild';

// The docs open straight from disk, where module scripts are blocked, so everything is bundled into classic files.
const root = new URL('../', import.meta.url).pathname;
const target = ['chrome123', 'edge123', 'safari17.5', 'firefox128'];
rmSync(`${root}dist`, { recursive: true, force: true });
await Promise.all([
  build({
    entryPoints: { docs: `${root}src/main.ts` },
    bundle: true,
    format: 'iife',
    minify: true,
    sourcemap: true,
    target,
    outdir: `${root}dist`,
    logLevel: 'warning',
  }),
  build({
    entryPoints: { docs: `${root}docs.css` },
    bundle: true,
    target,
    outdir: `${root}dist`,
    logLevel: 'warning',
  }),
]);
