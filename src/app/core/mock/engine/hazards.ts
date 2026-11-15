import { HAZARD_KEYS, HazardAssessment, HazardDriver, HazardKey, MetricKey, Status, scoreToStatus } from '../../models';
import { formatDelay, formatMetric, formatPct } from '../../util/format';
import { clamp } from '../prng';
import { at } from '../mission-plan';
import { lastAt, mean, sliceSamples } from '../stats';
import { mobilityAt } from '../mobility';
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

const driver = (label: string, value: string, c: number, w: number, metric?: MetricKey, concern?: string): Part => ({
  label,
  value,
  contribution: Math.round(clamp(Number.isFinite(c) ? c : 0, 0, 100)),
  w,
  metric,
  concern,
});

/** Deviation of a recent mean below the personal baseline. */
function lowDriver(ctx: EngineContext, crewId: string, metric: MetricKey, days: number, label: string, w: number, concern: string, gain = 45, cap = 100): Part {
  const b = ctx.db.baseline(crewId, metric);
  const x = recentMean(ctx, crewId, metric, days);
  const c = b && Number.isFinite(x) ? Math.min(cap, contrib(zLow(x, b), gain)) : 0;
  return driver(label, Number.isFinite(x) ? formatMetric(metric, x) : 'no data', c, w, metric, concern);
}

function highDriver(ctx: EngineContext, crewId: string, metric: MetricKey, days: number, label: string, w: number, concern: string, gain = 45, cap = 100): Part {
  const b = ctx.db.baseline(crewId, metric);
  const x = recentMean(ctx, crewId, metric, days);
  const c = b && Number.isFinite(x) ? Math.min(cap, contrib(zHigh(x, b), gain)) : 0;
  return driver(label, Number.isFinite(x) ? formatMetric(metric, x) : 'no data', c, w, metric, concern);
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

function crewDoseMedian(ctx: EngineContext): number {
  const d = ctx.db.crew().map((a) => latest(ctx, a.id, 'radDose')?.v ?? 0).sort((a, b) => a - b);
  return (d[1] + d[2]) / 2;
}

// ── Drivers per hazard ──────────────────────────────────────────────
function radiation(ctx: EngineContext, crewId: string): Part[] {
  const dose = latest(ctx, crewId, 'radDose')?.v ?? 0;
  const cumPct = (dose / ctx.careerLimitMsv) * 100;
  const excess = dose - crewDoseMedian(ctx);
  const rateNow = mean(sliceSamples(ctx.db.series(crewId, 'doseRate'), ctx.hour - 3, ctx.hour).map((s) => s.v));
  const lym = lastAt(ctx.db.series(crewId, 'lymphocytes'), ctx.hour);
  const lymB = ctx.db.baseline(crewId, 'lymphocytes');
  return [
    driver('Cumulative dose vs career limit', `${dose.toFixed(0)} mSv · ${cumPct.toFixed(0)}%`, cumPct * 0.62, 0.55, 'radDose', 'total dose is building toward the career limit'),
    driver('Excess vs crew median', `${excess >= 0 ? '+' : '−'}${Math.abs(excess).toFixed(0)} mSv`, excess * 1.4, 0.25, 'radDose', 'dose is higher than the rest of the crew'),
    driver('Dose rate, last 3 h', Number.isFinite(rateNow) ? formatMetric('doseRate', rateNow) : 'no data', (rateNow - 110) * 0.25, 0.12, 'doseRate', 'radiation levels are elevated right now'),
    driver(
      'Lymphocytes, latest lab',
      lym ? formatMetric('lymphocytes', lym.v) : 'no data',
      lym && lymB && ctx.hour - lym.t < 40 * H_PER_DAY ? contrib(zLow(lym.v, lymB), 40) : 0,
      0.08,
      'lymphocytes',
      'immune cell count dipped after radiation exposure',
    ),
  ];
}

function isolation(ctx: EngineContext, crewId: string): Part[] {
  const missed = missedCheckInDays(ctx, crewId, 7).length;
  return [
    lowDriver(ctx, crewId, 'mood', 7, 'Mood, 7-day mean', 0.22, 'mood has been lower than usual'),
    highDriver(ctx, crewId, 'stress', 14, 'Stress index, latest', 0.22, 'reported stress has risen'),
    lowDriver(ctx, crewId, 'hrv', 7, 'HRV, 7-day resting mean', 0.16, 'the body shows signs of strain (lower heart rate variability)'),
    lowDriver(ctx, crewId, 'sleepEfficiency', 7, 'Sleep efficiency, 7 nights', 0.14, 'sleep has been more broken'),
    highDriver(ctx, crewId, 'reactionTime', 10, 'Reaction time, latest test', 0.11, 'reaction time is slower', 30),
    driver('Missed check-ins, 7 days', `${missed} of 7`, missed * 22, 0.15, undefined, 'several daily check-ins were missed'),
  ];
}

function distance(ctx: EngineContext, crewId: string): Part[] {
  const delayC = ctx.link.mode === 'autonomous' ? 70 : (ctx.link.delaySeconds / 60) * 4;
  const vision = symptomCount(recentCheckIns(ctx, crewId, 7), 'vision');
  const kit = lastAt(ctx.db.series(crewId, 'medKit'), ctx.hour)?.v ?? 100;
  return [
    highDriver(ctx, crewId, 'workload', 14, 'Workload index, latest', 0.32, 'workload is heavy'),
    highDriver(ctx, crewId, 'stress', 14, 'Stress under autonomy', 0.16, 'stress is up while decisions rest with the crew', 25, 60),
    driver(
      ctx.link.mode === 'autonomous' ? 'Earth link lost, autonomous' : 'Signal delay to Earth',
      ctx.link.mode === 'autonomous' ? 'AUTONOMOUS' : formatDelay(ctx.link.delaySeconds),
      delayC,
      0.22,
      undefined,
      ctx.link.mode === 'autonomous' ? 'there is no link to Earth right now' : 'help from Earth takes several minutes each way',
    ),
    driver('Symptoms needing Earth consult', vision ? 'Vision change reported' : 'None open', vision ? 45 : 0, 0.15, undefined, 'a symptom needs specialist advice from Earth'),
    driver('Medical supply readiness', formatMetric('medKit', kit), (92 - kit) * 2.2, 0.15, 'medKit', 'medical supplies are running lower'),
  ];
}

function gravity(ctx: EngineContext, crewId: string): Part[] {
  const bone = lossRatePerMonth(ctx, crewId, 'boneDensity');
  const lean = lossRatePerMonth(ctx, crewId, 'muscleMass');
  const str = lossRatePerMonth(ctx, crewId, 'legStrength');
  const ci = recentCheckIns(ctx, crewId, 7);
  const h = symptomCount(ci, 'headache');
  const v = symptomCount(ci, 'vision');
  const cg = symptomCount(ci, 'congestion');
  const bp = symptomCount(ci, 'back-pain');
  const fluid = h * 12 + v * 35 + cg * 8;
  return [
    driver('Bone density change', `${formatPct(bone.pct, 1)} · ${formatPct(bone.perMonth, 2)}/mo`, (-bone.perMonth - 0.3) * 80, 0.24, 'boneDensity', 'bone is thinning faster than the target'),
    driver('Lean mass change', `${formatPct(lean.pct, 1)} · ${formatPct(lean.perMonth, 2)}/mo`, (-lean.perMonth - 0.25) * 70, 0.14, 'muscleMass', 'muscle mass is dropping'),
    driver('Leg strength change', `${formatPct(str.pct, 1)}`, (-str.perMonth - 0.35) * 55, 0.1, 'legStrength', 'leg strength is declining'),
    driver('Fluid-shift symptoms, 7 days', `${h} headache · ${v} vision · ${cg} congestion`, fluid, 0.24, undefined, 'headaches and vision changes suggest fluid shifting toward the head'),
    lowDriver(ctx, crewId, 'visionAcuity', 10, 'Near vision, latest check', 0.12, 'near vision has changed', 45),
    highDriver(ctx, crewId, 'bpSys', 7, 'Systolic BP, 7-day resting mean', 0.08, 'blood pressure has crept up'),
    driver('Back pain reports, 7 days', `${bp}`, bp * 15, 0.08, undefined, 'back pain has been reported'),
    ...mobilityDriver(ctx, crewId),
  ];
}

const MOBILITY_CONTRIBUTION: Record<Status, number> = { nominal: 10, watch: 55, alert: 85 };

/** Only present once the astronaut has done a mobility check (keeps scores unchanged before that). */
function mobilityDriver(ctx: EngineContext, crewId: string): Part[] {
  // +0.25: analysis runs on quarter-hour boundaries; include checks made since the last one.
  const m = mobilityAt(ctx.db.mobilityChecks(crewId), ctx.hour + 0.25);
  if (!m) return [];
  const flagged = m.tests.filter((t) => t.status !== 'nominal').map((t) => t.label);
  const value = flagged.length ? `${flagged.join(', ')} · D${m.lastCheckDay}` : `All 3 tests OK · D${m.lastCheckDay}`;
  return [driver('Mobility & balance check', value, MOBILITY_CONTRIBUTION[m.status], 0.12, undefined, 'balance or leg strength in the movement check has dropped')];
}

function environment(ctx: EngineContext, crewId: string): Part[] {
  const co2 = recentMean(ctx, crewId, 'co2', 3);
  const ci = recentCheckIns(ctx, crewId, 7);
  const sym = symptomCount(ci, 'headache') * 10 + symptomCount(ci, 'congestion') * 10;
  const b = ctx.db.bundle(crewId);
  const night = sliceSamples(ctx.db.series(crewId, 'cabinNoise'), ctx.hour - 3 * H_PER_DAY, ctx.hour).filter((s) => (b.asleep[s.t] ?? 0) > 0.5);
  const nightNoise = mean(night.map((s) => s.v));
  const wbc = lastAt(ctx.db.series(crewId, 'wbc'), ctx.hour);
  const wbcB = ctx.db.baseline(crewId, 'wbc');
  return [
    driver('CO₂ exposure, 3-day mean', Number.isFinite(co2) ? formatMetric('co2', co2) : 'no data', (co2 - 2.5) * 45, 0.32, 'co2', 'CO₂ in the air has been high'),
    lowDriver(ctx, crewId, 'sleepEfficiency', 7, 'Sleep efficiency, 7 nights', 0.18, 'sleep has been more broken', 25),
    driver('Night-time noise, 3 nights', Number.isFinite(nightNoise) ? formatMetric('cabinNoise', nightNoise) : 'no data', (nightNoise - 49) * 9, 0.14, 'cabinNoise', 'the sleep area has been noisy at night'),
    lowDriver(ctx, crewId, 'spo2', 3, 'SpO₂, 3-day resting mean', 0.1, 'blood oxygen is a little low'),
    driver(
      'White blood cells, latest lab',
      wbc ? formatMetric('wbc', wbc.v) : 'no data',
      wbc && wbcB ? contrib(zLow(wbc.v, wbcB), 40) : 0,
      0.1,
      'wbc',
      'the immune system looks suppressed',
    ),
    driver('Headache / congestion reports, 7 days', `${ci.filter((c) => c.symptoms.some((s) => s === 'headache' || s === 'congestion')).length}`, sym, 0.16, undefined, 'headaches or congestion were reported'),
  ];
}

const FNS: Record<HazardKey, (ctx: EngineContext, crewId: string) => Part[]> = {
  radiation,
  isolation,
  distance,
  gravity,
  environment,
};

// ── Plain-language headline + explanation ───────────────────────────
const CALM: Record<HazardKey, string> = {
  radiation: 'Dose is on the expected track for this point in the mission.',
  isolation: 'Mood, sleep and stress are in the usual range.',
  distance: 'Workload and support from Earth are manageable.',
  gravity: 'Bone, muscle and vision are holding up well with exercise.',
  environment: 'Air, noise and immune markers are in a healthy range.',
};

const NEXT_STEP: Record<HazardKey, string> = {
  radiation: 'Keep storm-shelter procedures fresh and limit time in lightly shielded modules.',
  isolation: 'Protected rest time and a private call home can help.',
  distance: 'Flag tasks that can wait and keep medical supplies under review.',
  gravity: 'Keep up daily exercise and report any change in vision or headaches.',
  environment: 'Report headaches; the life-support team is checking air and ventilation.',
};

function headline(ctx: EngineContext, crewId: string, hz: HazardKey): string {
  switch (hz) {
    case 'radiation': {
      const dose = latest(ctx, crewId, 'radDose')?.v ?? 0;
      return `${dose.toFixed(0)} mSv · ${((dose / ctx.careerLimitMsv) * 100).toFixed(0)}% of career limit`;
    }
    case 'isolation': {
      const mood = recentMean(ctx, crewId, 'mood', 7);
      const sleep = recentMean(ctx, crewId, 'sleepDuration', 7);
      return `Mood ${Number.isFinite(mood) ? mood.toFixed(1) : '—'}/5 · sleep ${Number.isFinite(sleep) ? sleep.toFixed(1) : '—'} h`;
    }
    case 'distance': {
      const w = lastAt(ctx.db.series(crewId, 'workload'), ctx.hour)?.v;
      const delay = ctx.link.mode === 'autonomous' ? 'No Earth link' : `${formatDelay(ctx.link.delaySeconds)} delay`;
      return `${delay} · workload ${w?.toFixed(0) ?? '—'}/100`;
    }
    case 'gravity': {
      const bone = lossRatePerMonth(ctx, crewId, 'boneDensity');
      return `Bone ${formatPct(bone.pct, 1)} since launch`;
    }
    case 'environment': {
      const co2 = recentMean(ctx, crewId, 'co2', 2);
      return `CO₂ ${Number.isFinite(co2) ? co2.toFixed(1) : '—'} mmHg (48 h)`;
    }
  }
}

function explanation(hz: HazardKey, status: Status, drivers: HazardDriver[]): string {
  if (status === 'nominal') return CALM[hz];
  const concerns = drivers.filter((d) => d.concern && d.contribution >= 35).slice(0, 2).map((d) => d.concern as string);
  if (!concerns.length) return CALM[hz];
  const lead = concerns.length === 2 ? `${cap(concerns[0])}, and ${concerns[1]}.` : `${cap(concerns[0])}.`;
  return `${lead} ${NEXT_STEP[hz]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function assessHazards(ctx: EngineContext): HazardAssessment[] {
  const out: HazardAssessment[] = [];
  for (const a of ctx.db.crew()) {
    for (const hz of HAZARD_KEYS) {
      const parts = FNS[hz](ctx, a.id);
      const score = combine(parts.map((p) => ({ c: p.contribution, w: p.w })));
      const status = scoreToStatus(score);
      const drivers = parts.map(({ w: _w, ...d }) => d).sort((x, y) => y.contribution - x.contribution);
      out.push({
        crewId: a.id,
        hazard: hz,
        score,
        status,
        drivers,
        headline: headline(ctx, a.id, hz),
        explanation: explanation(hz, status, drivers),
      });
    }
  }
  return out;
}

/** Daily hazard score history for one crew member (for hazard trend charts). */
