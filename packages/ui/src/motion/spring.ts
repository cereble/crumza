import { calm, inBrowser } from './env.ts';

export interface SpringConfig {
  readonly stiffness: number;
  readonly damping: number;
}

export type SpringName = 'snappy' | 'smooth' | 'lively' | 'pop' | 'lead' | 'lag';

/**
 * Snappy and smooth settle without overshoot; lively overshoots and is for small things only; pop overshoots more,
 * for a dot or a badge arriving. A gliding plate's leading edge uses lead and its trailing edge lag, which is what
 * makes it stretch as it travels. The CSS tokens --cz-snappy, --cz-smooth, --cz-lively and --cz-pop are generated
 * from these at build time, so script and stylesheet move alike.
 */
export const SPRING: Readonly<Record<SpringName, SpringConfig>> = {
  snappy: { stiffness: 620, damping: 46 },
  smooth: { stiffness: 340, damping: 36 },
  lively: { stiffness: 520, damping: 24 },
  pop: { stiffness: 600, damping: 19.5 },
  lead: { stiffness: 900, damping: 58 },
  lag: { stiffness: 300, damping: 33 },
};

const SUBSTEP = 0.004;

/** Advances a damped spring by `dt` seconds. Pure, so it is testable without a browser. */
export function springStep(
  value: number,
  velocity: number,
  target: number,
  config: SpringConfig,
  dt: number,
): readonly [value: number, velocity: number] {
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
  const h = dt / steps;
  let x = value;
  let v = velocity;
  for (let i = 0; i < steps; i++) {
    v += (-config.stiffness * (x - target) - config.damping * v) * h;
    x += v * h;
  }
  return [x, v];
}

export interface SpringOptions {
  readonly config?: SpringConfig;
  /** How close to the target counts as settled. The default, 0.01, suits pixels; use 0.001 for scale. */
  readonly precision?: number;
  readonly onUpdate?: (value: number) => void;
  readonly onRest?: () => void;
}

const running = new Set<Spring>();
let frame = 0;
let then = 0;

function tick(now: number): void {
  const dt = Math.min(0.064, Math.max(0.001, (now - then) / 1000));
  then = now;
  for (const spring of running) spring.advance(dt);
  frame = running.size > 0 ? requestAnimationFrame(tick) : 0;
}

/**
 * A spring that keeps its velocity when its target changes mid-flight, so interrupted motion carries on instead of
 * restarting. All springs share one animation frame loop that stops when they all rest.
 */
export class Spring {
  value: number;
  target: number;
  velocity = 0;
  config: SpringConfig;
  readonly #precision: number;
  readonly #onUpdate: ((value: number) => void) | undefined;
  readonly #onRest: (() => void) | undefined;
  #waiting: (() => void)[] = [];

  constructor(value = 0, options: SpringOptions = {}) {
    this.value = value;
    this.target = value;
    this.config = options.config ?? SPRING.smooth;
    this.#precision = options.precision ?? 0.01;
    this.#onUpdate = options.onUpdate;
    this.#onRest = options.onRest;
  }

  get resting(): boolean {
    return !running.has(this);
  }

  /** Resolves when the spring next comes to rest, or at once if it already rests. */
  settled(): Promise<void> {
    if (this.resting) return Promise.resolve();
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  #release(): void {
    for (const resolve of this.#waiting.splice(0)) resolve();
  }

  /** Heads for `target`; under reduced motion it jumps there. */
  to(target: number, config?: SpringConfig): this {
    this.target = target;
    if (config) this.config = config;
    if (calm() || !inBrowser) return this.jump(target);
    running.add(this);
    if (frame === 0) {
      then = performance.now();
      frame = requestAnimationFrame(tick);
    }
    return this;
  }

  /** Lands on `value` at once, with no velocity left. */
  jump(value: number): this {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    running.delete(this);
    this.#onUpdate?.(value);
    this.#release();
    return this;
  }

  /** Stops where it is. */
  stop(): this {
    running.delete(this);
    this.velocity = 0;
    this.#release();
    return this;
  }

  /** Called by the frame loop. */
  advance(dt: number): void {
    const [x, v] = springStep(this.value, this.velocity, this.target, this.config, dt);
    const settled = Math.abs(x - this.target) < this.#precision && Math.abs(v) < this.#precision * 5;
    this.value = settled ? this.target : x;
    this.velocity = settled ? 0 : v;
    this.#onUpdate?.(this.value);
    if (settled) {
      running.delete(this);
      this.#onRest?.();
      this.#release();
    }
  }
}

export interface SpringEasing {
  /** Settle time in milliseconds. */
  readonly duration: number;
  /** A CSS linear() easing. */
  readonly easing: string;
}

const curves = new Map<string, SpringEasing>();

/** A spring baked into a CSS linear() easing for the Web Animations API. Cached per configuration. */
export function springEasing(config: SpringConfig = SPRING.smooth): SpringEasing {
  const key = `${config.stiffness}:${config.damping}`;
  const cached = curves.get(key);
  if (cached) return cached;
  const samples: [time: number, value: number][] = [];
  let x = 0;
  let v = 0;
  let t = 0;
  while (t < 2.5) {
    [x, v] = springStep(x, v, 1, config, 0.01);
    t += 0.01;
    samples.push([t, x]);
    if (t > 0.08 && Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.03) break;
  }
  const stops = samples
    .slice(0, -1)
    .filter((_, i) => i % 2 === 1)
    .map(([time, value]) => `${Number(value.toFixed(3))} ${Number(((time / t) * 100).toFixed(1))}%`);
  const curve: SpringEasing = { duration: Math.round(t * 1000), easing: `linear(0, ${stops.join(', ')}, 1)` };
  curves.set(key, curve);
  return curve;
}
