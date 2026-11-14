import { Baseline, CheckIn, LinkState, METRICS, MetricKey, MissionEvent, Symptom } from '../../models';
import { MockDatabase } from '../mock-database';
import { mean, sliceSamples, lastAt } from '../stats';
import { clamp } from '../prng';

export interface EngineContext {
  db: MockDatabase;
  /** Evaluation time, mission hour. */
  hour: number;
  link: LinkState;
  careerLimitMsv: number;
}

export const H_PER_DAY = 24;

/** Half-width of a baseline band. */
export const halfBand = (b: Baseline): number => Math.max(1e-6, (b.high - b.low) / 2);

/** Standardised deviation in the concerning direction (0 = at baseline mean, 1 = at band edge). */
export const zLow = (x: number, b: Baseline): number => (b.mean - x) / halfBand(b);
export const zHigh = (x: number, b: Baseline): number => (x - b.mean) / halfBand(b);

/** Map a z deviation onto a 0–100 contribution. Band edge ≈ 45. */
export const contrib = (z: number, gain = 45): number => clamp(z * gain, 0, 100);

/** Mean of recent samples over `days` ending at ctx.hour. Hourly vitals exclude exercise/EVA hours. */
export function recentMean(ctx: EngineContext, crewId: string, metric: MetricKey, days: number): number {
  const all = ctx.db.series(crewId, metric);
  let samples = sliceSamples(all, ctx.hour - days * H_PER_DAY, ctx.hour);
  if (METRICS[metric].cadence === 'hourly') {
    samples = samples.filter((s) => !ctx.db.isActive(crewId, s.t));
  }
  return mean(samples.map((s) => s.v));
}

export function latest(ctx: EngineContext, crewId: string, metric: MetricKey) {
  return lastAt(ctx.db.series(crewId, metric), ctx.hour);
}

export function recentCheckIns(ctx: EngineContext, crewId: string, days: number): CheckIn[] {
  return ctx.db.checkIns(crewId).filter((c) => c.at <= ctx.hour && c.at > ctx.hour - days * H_PER_DAY);
}

export function symptomCount(checkIns: CheckIn[], symptom: Symptom): number {
  return checkIns.filter((c) => c.symptoms.includes(symptom)).length;
}

/** Completed days in the last `days` with no check-in (today excluded). */
export function missedCheckInDays(ctx: EngineContext, crewId: string, days: number): number[] {
  const today = Math.floor(ctx.hour / H_PER_DAY) + 1;
  const have = new Set(ctx.db.checkIns(crewId).filter((c) => c.at <= ctx.hour).map((c) => c.day));
  const missed: number[] = [];
  for (let d = today - days; d < today; d++) if (d >= 1 && !have.has(d)) missed.push(d);
  return missed;
}

export function nextEvaFor(ctx: EngineContext, crewId: string): MissionEvent | undefined {
  return ctx.db
    .events()
    .filter((e) => e.kind === 'eva' && e.crewIds.includes(crewId) && e.start > ctx.hour)
    .sort((a, b) => a.start - b.start)[0];
}

/** Combine driver contributions: dominated by the worst driver, tempered by the rest. */
export function combine(parts: { c: number; w: number }[]): number {
  const max = Math.max(0, ...parts.map((p) => p.c));
  const wsum = parts.reduce((s, p) => s + p.w, 0) || 1;
  const wmean = parts.reduce((s, p) => s + p.c * p.w, 0) / wsum;
  return Math.round(clamp(0.4 * max + 0.6 * wmean, 0, 100));
}
