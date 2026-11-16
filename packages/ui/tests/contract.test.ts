import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { brandSheet, brandStyle } from '../src/brand/index.ts';

const read = (dir: string, ext: string): string =>
  readdirSync(new URL(dir, import.meta.url))
    .filter((file) => file.endsWith(ext) && file !== 'brand.css')
    .map((file) => readFileSync(new URL(`${dir}${file}`, import.meta.url), 'utf8'))
    .join('\n');

const css = read('../src/styles/', '.css');
const scripts = `${read('../src/motion/', '.ts')}\n${read('../src/behaviors/', '.ts')}`;
const brand = Object.keys(brandStyle({ primary: '#66736c', fonts: { sans: 'A', display: 'B', mono: 'C' } }));

const all = (text: string, pattern: RegExp): Set<string> => new Set([...text.matchAll(pattern)].map((m) => m[1] ?? ''));
const declared = all(`${css}\n${brandSheet()}`, /(--[\w-]+)\s*:/g);
const registered = all(css, /@property\s+(--[\w-]+)/g);
const setByScript = all(scripts, /setProperty\(\s*['`](--[\w-]+)/g);
// Reads with no fallback must resolve to something: a declaration, the brand, or a value a behaviour sets.
const bare = all(css, /var\(\s*(--[\w-]+)\s*\)/g);

test('every custom property the styles read without a fallback is provided', () => {
  const known = new Set([...declared, ...registered, ...setByScript, ...brand]);
  assert.deepEqual([...bare].filter((name) => !known.has(name)).sort(), []);
});

test('every custom property a behaviour sets is read by the styles', () => {
  const used = all(css, /var\(\s*(--[\w-]+)/g);
  assert.deepEqual([...setByScript].filter((name) => !used.has(name)).sort(), []);
});

test("the brand's fonts land on properties the styles read", () => {
  for (const name of ['--cz-font', '--cz-font-display', '--cz-mono']) {
    assert.ok(brand.includes(name), `the brand writes ${name}`);
    assert.ok(new RegExp(`var\\(${name}[,)]`).test(css), `the styles read ${name}`);
  }
});
