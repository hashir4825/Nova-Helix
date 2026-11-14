/** FNV-1a 32-bit string hash, used to derive deterministic seeds. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small, fast, seeded PRNG. Same seed, same sequence, every load. */
export class Rng {
  private state: number;
  private spare: number | null = null;

  constructor(seed: number | string) {
    this.state = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  }

  /** Uniform [0, 1) — mulberry32. */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard normal via Box–Muller. */
  gauss(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** First-order autoregressive noise: smooth, realistic physiological drift. */
export class ArNoise {
  private value = 0;
  private readonly k: number;

  constructor(
    private readonly rng: Rng,
    private readonly sd: number,
    private readonly phi = 0.7,
  ) {
    this.k = Math.sqrt(1 - phi * phi);
  }

  step(): number {
    this.value = this.phi * this.value + this.k * this.sd * this.rng.gauss();
    return this.value;
  }
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
