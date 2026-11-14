import { Sample } from '../models';

/** Index of first sample with t >= time (samples sorted by t). */
export function lowerBound(samples: Sample[], time: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Samples with from <= t <= to. */
export function sliceSamples(samples: Sample[], from: number, to: number): Sample[] {
  return samples.slice(lowerBound(samples, from), lowerBound(samples, to + 1e-9));
}

/** Latest sample at or before time. */
export function lastAt(samples: Sample[], time: number): Sample | undefined {
  const i = lowerBound(samples, time + 1e-9) - 1;
  return i >= 0 ? samples[i] : undefined;
}

export function mean(values: number[]): number {
  if (!values.length) return NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return Math.sqrt(s / (values.length - 1));
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function meanIn(samples: Sample[], from: number, to: number): number {
  return mean(sliceSamples(samples, from, to).map((s) => s.v));
}

/** Least-squares slope (value per hour). */
export function slope(samples: Sample[]): number {
  if (samples.length < 2) return 0;
  const mt = mean(samples.map((s) => s.t));
  const mv = mean(samples.map((s) => s.v));
  let num = 0;
  let den = 0;
  for (const s of samples) {
    num += (s.t - mt) * (s.v - mv);
    den += (s.t - mt) ** 2;
  }
  return den ? num / den : 0;
}

/** Bucket samples into fixed-width means (for long ranges / sparklines). */
export function downsample(samples: Sample[], bucketHours: number): Sample[] {
  if (bucketHours <= 1 || !samples.length) return samples;
  const out: Sample[] = [];
  let bucket = Math.floor(samples[0].t / bucketHours);
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    const b = Math.floor(s.t / bucketHours);
    if (b !== bucket && count) {
      out.push({ t: bucket * bucketHours + bucketHours / 2, v: sum / count });
      sum = 0;
      count = 0;
      bucket = b;
    }
    sum += s.v;
    count++;
  }
  if (count) out.push({ t: bucket * bucketHours + bucketHours / 2, v: sum / count });
  return out;
}
