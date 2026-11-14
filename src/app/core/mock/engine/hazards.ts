import { HAZARD_KEYS, HazardAssessment, HazardDriver, HazardKey, MetricKey, scoreToStatus } from '../../models';
import { formatDelay, formatMetric, formatPct } from '../../util/format';
import { clamp } from '../prng';
import { at } from '../mission-plan';
import { lastAt } from '../stats';
import {
  EngineContext,
  H_PER_DAY,
  combine,
  contrib,
  latest,
  missedCheckInDays,
  recentCheckIns,
  recentMean,
  symptomCount,
  zHigh,
  zLow,
} from './context';

interface Part extends HazardDriver {
  w: number;
}

const driver = (label: string, value: string, c: number, w: number, metric?: MetricKey): Part => ({
  label,
  value,
  contribution: Math.round(clamp(c, 0, 100)),
  w,
  metric,
});

/** Deviation of a recent mean below the personal baseline. */
function lowDriver(ctx: EngineContext, crewId: string, metric: MetricKey, days: number, label: string, w: number, gain = 45, cap = 100): Part {
  const b = ctx.db.baseline(crewId, metric);
  const x = recentMean(ctx, crewId, metric, days);
  const c = b && Number.isFinite(x) ? Math.min(cap, contrib(zLow(x, b), gain)) : 0;
  return driver(label, Number.isFinite(x) ? formatMetric(metric, x) : 'no data', c, w, metric);
}

function highDriver(ctx: EngineContext, crewId: string, metric: MetricKey, days: number, label: string, w: number, gain = 45, cap = 100): Part {
  const b = ctx.db.baseline(crewId, metric);
  const x = recentMean(ctx, crewId, metric, days);
  const c = b && Number.isFinite(x) ? Math.min(cap, contrib(zHigh(x, b), gain)) : 0;
  return driver(label, Number.isFinite(x) ? formatMetric(metric, x) : 'no data', c, w, metric);
}

/** Percent change per month since the first measurement. */
function lossRatePerMonth(ctx: EngineContext, crewId: string, metric: MetricKey): { pct: number; perMonth: number } {
  const all = ctx.db.series(crewId, metric);
  const first = all[0];
  const last = lastAt(all, ctx.hour);
  if (!first || !last || last.t <= first.t) return { pct: 0, perMonth: 0 };
  const pct = ((last.v - first.v) / first.v) * 100;
  const months = (last.t - first.t) / H_PER_DAY / 30.44;
  return { pct, perMonth: pct / months };
}

function radiation(ctx: EngineContext, crewId: string): Part[] {
  const dose = latest(ctx, crewId, 'radDose')?.v ?? 0;
  const cumPct = (dose / ctx.careerLimitMsv) * 100;
  const crewDoses = ctx.db.crew().map((a) => latest(ctx, a.id, 'radDose')?.v ?? 0).sort((a, b) => a - b);
  const median = (crewDoses[1] + crewDoses[2]) / 2;
  const excess = dose - median;
  const prev = lastAt(ctx.db.series(crewId, 'radDose'), ctx.hour - H_PER_DAY)?.v ?? dose;
  const rate24 = dose - prev;
  return [
    driver('Cumulative dose vs career limit', `${dose.toFixed(0)} mSv · ${cumPct.toFixed(0)}%`, cumPct * 0.62, 0.6, 'radDose'),
    driver('Excess vs crew median', `${excess >= 0 ? '+' : '−'}${Math.abs(excess).toFixed(0)} mSv`, excess * 1.4, 0.25, 'radDose'),
    driver('Dose rate, last 24 h', `${rate24.toFixed(1)} mSv/d`, (rate24 - 2.2) * 6, 0.15, 'radDose'),
  ];
}

function isolation(ctx: EngineContext, crewId: string): Part[] {
  const missed = missedCheckInDays(ctx, crewId, 7).length;
  return [
    lowDriver(ctx, crewId, 'mood', 7, 'Mood, 7-day mean', 0.25),
    highDriver(ctx, crewId, 'stress', 14, 'Stress index, latest', 0.25),
    lowDriver(ctx, crewId, 'hrv', 7, 'HRV, 7-day resting mean', 0.2),
    lowDriver(ctx, crewId, 'sleepEfficiency', 7, 'Sleep efficiency, 7 nights', 0.15),
    driver('Missed check-ins, 7 days', `${missed} of 7`, missed * 22, 0.15),
  ];
}

function distance(ctx: EngineContext, crewId: string): Part[] {
  const delayC = ctx.link.mode === 'autonomous' ? 70 : (ctx.link.delaySeconds / 60) * 4;
  const vision = symptomCount(recentCheckIns(ctx, crewId, 7), 'vision');
  return [
    highDriver(ctx, crewId, 'workload', 14, 'Workload index, latest', 0.35),
    highDriver(ctx, crewId, 'stress', 14, 'Stress under autonomy', 0.2, 25, 60),
    driver(
      ctx.link.mode === 'autonomous' ? 'Earth link lost, autonomous' : 'Signal delay to Earth',
      ctx.link.mode === 'autonomous' ? 'AUTONOMOUS' : formatDelay(ctx.link.delaySeconds),
      delayC,
      0.25,
    ),
    driver('Symptoms needing Earth consult', vision ? 'Vision change reported' : 'None open', vision ? 45 : 0, 0.2),
  ];
}

function gravity(ctx: EngineContext, crewId: string): Part[] {
  const bone = lossRatePerMonth(ctx, crewId, 'boneDensity');
  const lean = lossRatePerMonth(ctx, crewId, 'muscleMass');
  const ci = recentCheckIns(ctx, crewId, 7);
  const h = symptomCount(ci, 'headache');
  const v = symptomCount(ci, 'vision');
  const cg = symptomCount(ci, 'congestion');
  const bp = symptomCount(ci, 'back-pain');
  const fluid = h * 12 + v * 35 + cg * 8;
  return [
    driver('Bone density change', `${formatPct(bone.pct, 1)} · ${formatPct(bone.perMonth, 2)}/mo`, (-bone.perMonth - 0.3) * 80, 0.3, 'boneDensity'),
    driver('Lean mass change', `${formatPct(lean.pct, 1)} · ${formatPct(lean.perMonth, 2)}/mo`, (-lean.perMonth - 0.25) * 70, 0.2, 'muscleMass'),
    driver('Fluid-shift symptoms, 7 days', `${h} headache · ${v} vision · ${cg} congestion`, fluid, 0.3),
    highDriver(ctx, crewId, 'bpSys', 7, 'Systolic BP, 7-day resting mean', 0.1),
    driver('Back pain reports, 7 days', `${bp}`, bp * 15, 0.1),
  ];
}

function environment(ctx: EngineContext, crewId: string): Part[] {
  const co2 = recentMean(ctx, crewId, 'co2', 3);
  const ci = recentCheckIns(ctx, crewId, 7);
  const sym = symptomCount(ci, 'headache') * 10 + symptomCount(ci, 'congestion') * 10;
  return [
    driver('CO₂ exposure, 3-day mean', Number.isFinite(co2) ? formatMetric('co2', co2) : 'no data', (co2 - 2.5) * 45, 0.4, 'co2'),
    lowDriver(ctx, crewId, 'sleepEfficiency', 7, 'Sleep efficiency, 7 nights', 0.25, 25),
    lowDriver(ctx, crewId, 'spo2', 3, 'SpO₂, 3-day resting mean', 0.15),
    driver('Headache / congestion reports, 7 days', `${ci.filter((c) => c.symptoms.some((s) => s === 'headache' || s === 'congestion')).length}`, sym, 0.2),
  ];
}

const FNS: Record<HazardKey, (ctx: EngineContext, crewId: string) => Part[]> = {
  radiation,
  isolation,
  distance,
  gravity,
  environment,
};

export function assessHazards(ctx: EngineContext): HazardAssessment[] {
  const out: HazardAssessment[] = [];
  for (const a of ctx.db.crew()) {
    for (const hz of HAZARD_KEYS) {
      const parts = FNS[hz](ctx, a.id);
      const score = combine(parts.map((p) => ({ c: p.contribution, w: p.w })));
      out.push({
        crewId: a.id,
        hazard: hz,
        score,
        status: scoreToStatus(score),
        drivers: parts
          .map(({ w: _w, ...d }) => d)
          .sort((x, y) => y.contribution - x.contribution),
      });
    }
  }
  return out;
}

/** Daily hazard score history for one crew member (for hazard trend charts). */
export function hazardHistory(ctx: EngineContext, hazard: HazardKey, crewId: string, fromDay: number, toDay: number, stepDays = 1) {
  const out: { t: number; v: number }[] = [];
  for (let d = fromDay; d <= toDay; d += stepDays) {
    const hour = Math.min(ctx.hour, at(d, 20));
    const parts = FNS[hazard]({ ...ctx, hour }, crewId);
    out.push({ t: hour, v: combine(parts.map((p) => ({ c: p.contribution, w: p.w }))) });
  }
  return out;
}
