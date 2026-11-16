import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SPRING, Spring, springEasing, springStep } from '../src/motion/index.ts';

const simulate = (config: (typeof SPRING)[keyof typeof SPRING]) => {
  let x = 0;
  let v = 0;
  let peak = 0;
  for (let t = 0; t < 2; t += 1 / 120) {
    [x, v] = springStep(x, v, 1, config, 1 / 120);
    peak = Math.max(peak, x);
  }
  return { end: x, peak };
};

describe('springs', () => {
  test('settle on their target, and only lively overshoots', () => {
    for (const name of ['snappy', 'smooth', 'lead', 'lag'] as const) {
      const { end, peak } = simulate(SPRING[name]);
      assert.ok(Math.abs(end - 1) < 1e-3, `${name} ends at ${end}`);
      assert.ok(peak <= 1.002, `${name} peaks at ${peak}`);
    }
    const lively = simulate(SPRING.lively);
    assert.ok(Math.abs(lively.end - 1) < 1e-3);
    assert.ok(lively.peak > 1.08, `lively peaks at ${lively.peak}`);
  });

  test('baked into linear() they start at 0, end at 1, last as long as the spring and are cached', () => {
    const curve = springEasing(SPRING.smooth);
    assert.match(curve.easing, /^linear\(0, .+, 1\)$/);
    assert.ok(curve.duration > 300 && curve.duration < 700, `${curve.duration} ms`);
    assert.equal(springEasing(SPRING.smooth), curve);
    assert.ok(springEasing(SPRING.lively).duration > curve.duration);
  });

  test('run on the server: no window, and a spring lands on its target at once', () => {
    assert.equal(typeof globalThis.window, 'undefined');
    const seen: number[] = [];
    const spring = new Spring(0, { onUpdate: (value) => seen.push(value) });
    spring.to(12);
    assert.equal(spring.value, 12);
    assert.deepEqual(seen, [12]);
    assert.ok(spring.resting);
  });
});
