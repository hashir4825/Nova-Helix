import { Evidence, HAZARDS, METRICS, MetricInterpretation, MetricKey, RecommendedAction, Status } from '../../models';
import { formatMetric, formatPct } from '../../util/format';
import { lastAt, mean, sliceSamples, slope } from '../stats';
import { EngineContext, H_PER_DAY, halfBand } from './context';
import { detectInsights } from './insights';

/** Window used to judge "recent" per cadence (days). */
const WINDOW: Record<string, number> = { hourly: 7, daily: 7, session: 14, weekly: 21, monthly: 70 };

const WHY: Partial<Record<MetricKey, string>> = {
  hr: 'A resting heart rate that stays above normal can reflect stress, poor sleep, illness or deconditioning.',
  hrv: 'Heart rate variability falls when the body is under sustained stress or not recovering well.',
  spo2: 'Low blood oxygen can point to cabin air problems or a respiratory issue.',
  coreTemp: 'A rise in core temperature can be the first sign of infection or heat stress.',
  bpSys: 'In microgravity, fluid moves toward the head; rising pressure is linked to vision changes (SANS).',
  bpDia: 'Diastolic pressure helps judge cardiovascular adaptation to microgravity.',
  resp: 'Faster breathing at rest can signal anxiety, exertion or poor air quality.',
  sleepDuration: 'Short sleep builds up fatigue that slows reactions and raises the chance of mistakes.',
  sleepEfficiency: 'Broken sleep is less restorative even when time in bed looks normal.',
  radDose: 'Total dose drives long-term cancer and heart risk; staying under the career limit protects future health.',
  doseRate: 'A sudden rise means a solar particle event: shelter immediately to cut the dose.',
  boneDensity: 'Bone lost in space returns slowly and raises fracture risk on Mars and back on Earth.',
  muscleMass: 'Muscle loss reduces strength needed for spacewalks and work on the surface.',
  legStrength: 'Leg strength is what the crew needs to walk and work on Mars after months of weightlessness.',
  mood: 'Mood is the earliest self-reported sign of isolation stress.',
  energy: 'Low energy over several days often precedes illness or burnout.',
  sleepQuality: 'How rested someone feels is a direct check on sleep quality.',
  stress: 'Sustained stress affects sleep, team work and decision making.',
  workload: 'With growing signal delay, the crew plans more alone; sustained high workload erodes margin.',
  co2: 'CO₂ above 3 mmHg is linked to headaches, poor focus and worse sleep.',
  reactionTime: 'Slower reaction time is an objective sign of fatigue and affects safety-critical work.',
  visionAcuity: 'A drop in near vision can be an early sign of spaceflight-associated neuro-ocular syndrome.',
  wbc: 'Spaceflight can suppress the immune system; low counts raise infection risk.',
  lymphocytes: 'Lymphocytes are sensitive to radiation and stress.',
  boneMarker: 'A rising breakdown marker shows bone is being lost faster, weeks before a scan can see it.',
  cabinNoise: 'Noise disturbs sleep and, over time, hearing.',
  cabinTemp: 'Comfortable temperature supports sleep and reduces heat strain.',
  cabinHumidity: 'High humidity encourages microbial growth on surfaces.',
  medKit: 'With no resupply, medical supplies must last the whole mission.',
};

/** Signals that compound almost everything: always worth checking alongside a vital. */
const WELLNESS: MetricKey[] = ['sleepDuration', 'sleepEfficiency', 'hrv', 'stress', 'mood', 'reactionTime'];

/**
 * Related measurements (same body system, or general wellness signals) that are
 * currently outside this astronaut's normal range, most deviant first.
 */
function relatedOutOfRange(ctx: EngineContext, crewId: string, metric: MetricKey): Evidence[] {
  const def = METRICS[metric];
  const out: { e: Evidence; z: number }[] = [];
  for (const k of Object.keys(METRICS) as MetricKey[]) {
    if (k === metric) continue;
    const m = METRICS[k];
    const related = m.group === def.group || WELLNESS.includes(k);
    if (!related) continue;
    const b = ctx.db.baseline(crewId, k);
    if (!b) continue;
    const all = ctx.db.series(crewId, k);
    const x =
      m.cadence === 'hourly' || m.cadence === 'daily'
        ? mean(sliceSamples(all, ctx.hour - 7 * H_PER_DAY, ctx.hour).filter((s) => m.cadence !== 'hourly' || !ctx.db.isActive(crewId, s.t)).map((s) => s.v))
        : (lastAt(all, ctx.hour)?.v ?? NaN);
    if (!Number.isFinite(x)) continue;
    const z = (x - b.mean) / halfBand(b);
    const concerning = (z > 1 && m.concern !== 'low') || (z < -1 && m.concern !== 'high');
    if (!concerning) continue;
    out.push({
      z: Math.abs(z),
      e: { label: m.label, value: formatMetric(k, x), reference: formatMetric(k, b.mean), metric: k, crewId, direction: z > 0 ? 'up' : 'down' },
    });
  }
  return out.sort((a, b) => b.z - a.z).slice(0, 4).map((o) => o.e);
}

export function interpretMetric(ctx: EngineContext, crewId: string, metric: MetricKey): MetricInterpretation {
  const def = METRICS[metric];
  const name = ctx.db.astronaut(crewId)?.name ?? crewId;
  const days = WINDOW[def.cadence] ?? 7;
  const all = ctx.db.series(crewId, metric);
  let recent = sliceSamples(all, ctx.hour - days * H_PER_DAY, ctx.hour);
  if (def.cadence === 'hourly' && metric !== 'doseRate' && def.group === 'vitals') {
    recent = recent.filter((s) => !ctx.db.isActive(crewId, s.t));
  }
  const b = ctx.db.baseline(crewId, metric);
  const last = lastAt(all, ctx.hour);
  const avg = def.cadence === 'hourly' || def.cadence === 'daily' ? mean(recent.map((s) => s.v)) : (last?.v ?? NaN);
  const perDay = slope(sliceSamples(all, ctx.hour - Math.max(days, 14) * H_PER_DAY, ctx.hour)) * H_PER_DAY;
  const span = b ? halfBand(b) : Math.abs(avg) * 0.05 || 1;
  const trend: MetricInterpretation['trend'] = Math.abs(perDay * 7) < span * 0.25 ? 'flat' : perDay > 0 ? 'up' : 'down';

  // Status vs baseline + thresholds
  let status: Status = 'nominal';
  if (b && Number.isFinite(avg)) {
    const outLow = avg < b.low && def.concern !== 'high';
    const outHigh = avg > b.high && def.concern !== 'low';
    if (outLow || outHigh) status = 'watch';
  }
  for (const t of def.thresholds) {
    const hit = t.direction === 'above' ? avg > t.value : avg < t.value;
    if (hit && (t.level === 'alert' || status === 'nominal')) status = t.level;
  }

  // What changed
  const windowText = def.cadence === 'hourly' || def.cadence === 'daily' ? `Over the last ${days} days` : 'At the latest measurement';
  const verb = def.cadence === 'hourly' || def.cadence === 'daily' ? 'averaged' : 'was';
  let summary = `${windowText} ${def.label.toLowerCase()} ${verb} ${formatMetric(metric, avg)}`;
  if (b) {
    const pct = ((avg - b.mean) / b.mean) * 100;
    const where = avg > b.high ? 'above' : avg < b.low ? 'below' : 'within';
    summary +=
      where === 'within'
        ? `, within ${name}'s normal range (${formatMetric(metric, b.low, false)}–${formatMetric(metric, b.high)}).`
        : `, ${formatPct(pct)} versus ${name}'s normal (${formatMetric(metric, b.mean)}), ${where} the usual range.`;
  } else if (metric === 'radDose') {
    summary += `, ${((avg / ctx.careerLimitMsv) * 100).toFixed(0)}% of the ${ctx.careerLimitMsv} mSv career limit.`;
  } else {
    summary += '.';
  }
  summary += trend === 'flat' ? ' The trend is stable.' : ` The trend is ${trend === 'up' ? 'rising' : 'falling'}.`;

  // Related findings and hazards
  const insights = detectInsights(ctx).filter(
    (i) => (i.crewId === crewId || i.crewId === null) && (i.primaryMetric === metric || i.evidence.some((e) => e.metric === metric && (e.crewId ?? crewId) === crewId)),
  );
  const top = insights[0];
  const contributing: Evidence[] = top ? top.evidence.filter((e) => e.metric !== metric).slice(0, 4) : relatedOutOfRange(ctx, crewId, metric);

  const recommended: RecommendedAction[] =
    top?.recommended ??
    (status === 'nominal'
      ? [{ kind: 'acknowledge', label: 'No action needed', detail: 'Keep monitoring at the usual cadence.' }]
      : def.hazards.slice(0, 1).map((h) => ({ kind: 'message' as const, label: 'Review countermeasure', detail: HAZARDS[h].countermeasures[0] })));

  const samples = recent.length;
  const confidence = top ? top.confidence : Math.round(Math.min(0.92, 0.55 + Math.min(samples, 40) * 0.008 + (b ? 0.06 : 0)) * 100) / 100;

  return {
    crewId,
    metric,
    summary,
    whyItMatters: top?.whyItMatters ?? WHY[metric] ?? def.source,
    contributing,
    confidence,
    recommended,
    trend,
    status,
  };
}
