import { Evidence, Insight, RecommendedAction, SAFETY_SIGNAL_LABEL, SEVERITY_RANK, SafetyFlag, Severity, SYMPTOM_LABEL } from '../../models';
import { formatClock, formatDelay, formatMetric, formatMissionTime, formatPct } from '../../util/format';
import { clamp } from '../prng';
import { MISSION_CONFIG, hourToDay } from '../mission-plan';
import { QUESTIONNAIRES } from '../questionnaires';
import { lastAt, mean, sliceSamples } from '../stats';
import { mobilityAt } from '../mobility';
import {
  EngineContext,
  H_PER_DAY,
  latest,
  missedCheckInDays,
  nextEvaFor,
  recentCheckIns,
  recentMean,
  symptomCount,
} from './context';

type Rule = (ctx: EngineContext, crewId: string) => Insight | null;

const confidence = (signals: number, base = 0.56): number => Math.round(clamp(base + signals * 0.08, 0, 0.95) * 100) / 100;

const name = (ctx: EngineContext, crewId: string): string => ctx.db.astronaut(crewId)?.name ?? crewId;

const dir = (now: number, ref: number): Evidence['direction'] => (Math.abs(now - ref) < 1e-6 ? 'flat' : now > ref ? 'up' : 'down');

// ─────────────────────────────────────────────────────────────────────
const sleepDebt: Rule = (ctx, crewId) => {
  const b = ctx.db.baseline(crewId, 'sleepDuration');
  const x = recentMean(ctx, crewId, 'sleepDuration', 5);
  if (!b || !Number.isFinite(x)) return null;
  const deficit = b.mean - x;
  if (deficit < 1.0) return null;

  const effB = ctx.db.baseline(crewId, 'sleepEfficiency');
  const eff = recentMean(ctx, crewId, 'sleepEfficiency', 5);
  const hrvB = ctx.db.baseline(crewId, 'hrv');
  const hrv = recentMean(ctx, crewId, 'hrv', 7);
  const sq = recentMean(ctx, crewId, 'sleepQuality', 5);
  const eva = nextEvaFor(ctx, crewId);
  const evaDays = eva ? Math.ceil((eva.start - ctx.hour) / H_PER_DAY) : null;
  const evaSoon = evaDays !== null && evaDays <= 5;
  const shift = ctx.db
    .events()
    .find((e) => e.kind === 'sleep-shift' && e.crewIds.includes(crewId) && e.start <= ctx.hour && e.end >= ctx.hour);

  const evidence: Evidence[] = [
    { label: 'Sleep, 5-night mean', value: formatMetric('sleepDuration', x), reference: formatMetric('sleepDuration', b.mean), metric: 'sleepDuration', crewId, direction: 'down' },
  ];
  let signals = 1;
  if (effB && eff < effB.low) {
    signals++;
    evidence.push({ label: 'Sleep efficiency, 5 nights', value: formatMetric('sleepEfficiency', eff), reference: formatMetric('sleepEfficiency', effB.mean), metric: 'sleepEfficiency', crewId, direction: 'down' });
  }
  if (hrvB && hrv < hrvB.mean * 0.9) {
    signals++;
    evidence.push({ label: 'HRV, 7-day resting mean', value: formatMetric('hrv', hrv), reference: formatMetric('hrv', hrvB.mean), metric: 'hrv', crewId, direction: 'down' });
  }
  if (Number.isFinite(sq)) evidence.push({ label: 'Self-rated sleep quality', value: formatMetric('sleepQuality', sq), metric: 'sleepQuality', crewId, direction: dir(sq, 3.5) });
  const rtB = ctx.db.baseline(crewId, 'reactionTime');
  const rt = lastAt(ctx.db.series(crewId, 'reactionTime'), ctx.hour);
  if (rtB && rt && rt.v > rtB.high) {
    signals++;
    evidence.push({ label: 'Reaction time, latest test', value: formatMetric('reactionTime', rt.v), reference: formatMetric('reactionTime', rtB.mean), metric: 'reactionTime', crewId, direction: 'up' });
  }
  if (shift) evidence.push({ label: 'Active schedule change', value: shift.label });
  if (evaSoon && eva) evidence.push({ label: 'Next EVA', value: `${eva.label.split(' ')[0]} in ${evaDays} d` });

  const who = name(ctx, crewId);
  const title = evaSoon && eva ? `Sleep debt building ahead of ${eva.label.split(' ')[0]}` : 'Sleep debt building';
  const severity: Severity = deficit >= 2 || (evaSoon && deficit >= 1.8) ? 'alert' : 'watch';
  const latestSleep = lastAt(ctx.db.series(crewId, 'sleepDuration'), ctx.hour);
  return {
    id: `sleep-debt:${crewId}`,
    crewId,
    severity,
    hazards: ['isolation', 'environment'],
    title,
    summary:
      `${who} has averaged ${x.toFixed(1)} h of sleep over the last 5 nights, ${deficit.toFixed(1)} h below personal baseline.` +
      (shift ? ' The decline started with the planned sleep shift.' : '') +
      (evaSoon && eva ? ` ${eva.label.split(' ')[0]} is in ${evaDays} days.` : ''),
    whyItMatters:
      'Accumulated sleep loss degrades reaction time, procedural memory and error detection. ' +
      (evaSoon ? 'During EVA suit operations these errors carry the highest consequence on the mission.' : 'It also lowers mood and resilience to stress.'),
    detectedAt: latestSleep?.t ?? ctx.hour,
    primaryMetric: 'sleepDuration',
    evidence,
    confidence: confidence(signals),
    recommended: [
      { kind: 'countermeasure', countermeasure: 'sleep-shift', label: 'Adjust sleep shift', detail: 'Return sleep start to baseline for 2 nights; resume shift D144.' },
      { kind: 'countermeasure', countermeasure: 'rest', label: 'Protect sleep opportunity', detail: 'Block 8.5 h rest window; move evening procedure reviews.' },
      { kind: 'questionnaire', questionnaireId: 'sleep', label: 'Assign sleep questionnaire', detail: 'Short sleep-quality questionnaire to confirm the cause.' },
      ...(evaSoon ? [{ kind: 'escalate' as const, label: 'Escalate EVA go/no-go input', detail: 'Flag to Earth flight surgeon for EVA readiness review.' }] : []),
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────
const isolationStress: Rule = (ctx, crewId) => {
  const evidence: Evidence[] = [];
  let signals = 0;
  const moodB = ctx.db.baseline(crewId, 'mood');
  const mood = recentMean(ctx, crewId, 'mood', 7);
  if (moodB && mood < moodB.low) {
    signals++;
    evidence.push({ label: 'Mood, 7-day mean', value: formatMetric('mood', mood), reference: formatMetric('mood', moodB.mean), metric: 'mood', crewId, direction: 'down' });
  }
  const stressB = ctx.db.baseline(crewId, 'stress');
  const stressAll = sliceSamples(ctx.db.series(crewId, 'stress'), 0, ctx.hour);
  const stress = stressAll.at(-1);
  const stress3w = stressAll.at(-4);
  if (stressB && stress && stress.v > stressB.high) {
    signals++;
    evidence.push({
      label: 'Stress index, latest weekly',
      value: formatMetric('stress', stress.v),
      reference: stress3w ? `${formatMetric('stress', stress3w.v)} 3 wk ago` : formatMetric('stress', stressB.mean),
      metric: 'stress',
      crewId,
      direction: 'up',
    });
  }
  const hrvB = ctx.db.baseline(crewId, 'hrv');
  const hrv = recentMean(ctx, crewId, 'hrv', 7);
  if (hrvB && hrv < hrvB.mean * 0.85) {
    signals++;
    evidence.push({ label: 'HRV, 7-day resting mean', value: `${formatMetric('hrv', hrv)} (${formatPct(((hrv - hrvB.mean) / hrvB.mean) * 100)})`, reference: formatMetric('hrv', hrvB.mean), metric: 'hrv', crewId, direction: 'down' });
  }
  const missed = missedCheckInDays(ctx, crewId, 10);
  if (missed.length >= 2) {
    signals++;
    evidence.push({ label: 'Missed check-ins, 10 days', value: `${missed.length} (${missed.map((d) => `D${d}`).join(', ')})`, direction: 'up' });
  }
  const effB = ctx.db.baseline(crewId, 'sleepEfficiency');
  const eff = recentMean(ctx, crewId, 'sleepEfficiency', 7);
  if (effB && eff < effB.low) {
    signals++;
    evidence.push({ label: 'Sleep efficiency, 7 nights', value: formatMetric('sleepEfficiency', eff), reference: formatMetric('sleepEfficiency', effB.mean), metric: 'sleepEfficiency', crewId, direction: 'down' });
  }
  if (signals < 3) return null;
  const who = name(ctx, crewId);
  const severity: Severity = signals >= 4 ? 'alert' : 'watch';
  return {
    id: `isolation-stress:${crewId}`,
    crewId,
    severity,
    hazards: ['isolation', 'distance'],
    title: 'Isolation stress rising',
    summary: `${signals} independent signals for ${who} point the same way: lower mood, higher reported stress, suppressed HRV and fewer check-ins. The trend started around D${hourToDay(ctx.hour) - 30} and has not levelled off.`,
    whyItMatters:
      'Sustained isolation stress is a leading indicator for sleep disruption, conflict within the crew and reduced performance. With growing signal delay, early intervention onboard matters more.',
    detectedAt: Math.max(stress?.t ?? 0, latest(ctx, crewId, 'mood')?.t ?? 0),
    primaryMetric: 'stress',
    evidence,
    confidence: confidence(signals, 0.5),
    recommended: [
      { kind: 'message', label: 'Check in privately', detail: 'Send a private, low-pressure message from the flight surgeon.' },
      { kind: 'questionnaire', questionnaireId: 'team', label: 'Assign team dynamics questionnaire', detail: 'Short isolation and team-dynamics questionnaire.' },
      { kind: 'countermeasure', countermeasure: 'rest', label: 'Protected off-duty block', detail: 'Schedule 2 h crew-choice time tomorrow.' },
      { kind: 'escalate', label: 'Request psych conference', detail: 'Queue a private conference with the Earth-based psychologist.' },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────
const radiationOutlier: Rule = (ctx, crewId) => {
  const dose = latest(ctx, crewId, 'radDose')?.v ?? 0;
  const doses = ctx.db.crew().map((a) => latest(ctx, a.id, 'radDose')?.v ?? 0).sort((a, b) => a - b);
  const median = (doses[1] + doses[2]) / 2;
  if (dose < median * 1.08 || dose < Math.max(...doses) - 1e-6) return null;
  const pct = (dose / ctx.careerLimitMsv) * 100;
  const day = hourToDay(ctx.hour);
  const remaining = Math.max(0, 260 - day);
  const projected = dose + remaining * 1.8;
  const who = name(ctx, crewId);
  const spe = ctx.db.events().find((e) => e.kind === 'spe' && e.start <= ctx.hour);
  return {
    id: `rad-outlier:${crewId}`,
    crewId,
    severity: 'watch',
    hazards: ['radiation'],
    title: 'Highest cumulative radiation dose on crew',
    summary: `${who} is at ${dose.toFixed(0)} mSv (${pct.toFixed(0)}% of career limit), ${(dose - median).toFixed(0)} mSv above the crew median. Most of the gap comes from late storm-shelter entry during the D97 solar particle event.`,
    whyItMatters: `At the current GCR rate ${who} reaches about ${projected.toFixed(0)} mSv at Mars arrival (${((projected / ctx.careerLimitMsv) * 100).toFixed(0)}% of career limit), leaving little margin for another solar particle event.`,
    detectedAt: spe ? spe.end : ctx.hour,
    primaryMetric: 'radDose',
    evidence: [
      { label: 'Cumulative effective dose', value: `${dose.toFixed(0)} mSv`, reference: `${median.toFixed(0)} mSv crew median`, metric: 'radDose', crewId, direction: 'up' },
      { label: 'Share of career limit', value: `${pct.toFixed(0)}%`, reference: `${ctx.careerLimitMsv} mSv limit` },
      { label: 'Projected at arrival', value: `${projected.toFixed(0)} mSv` },
      ...(spe ? [{ label: 'Contributing event', value: spe.label }] : []),
    ],
    confidence: 0.92,
    recommended: [
      { kind: 'countermeasure', countermeasure: 'storm-shelter', label: 'Pre-assign shelter role', detail: 'Make another crew member responsible for the medical bay during the next SPE so this astronaut shelters first.' },
      { kind: 'message', label: 'Review duty cycle', detail: 'Reduce scheduled time in low-shielding modules.' },
      { kind: 'escalate', label: 'Career dose review', detail: 'Send dosimetry summary to the Earth radiation health officer.' },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────
const fluidShift: Rule = (ctx, crewId) => {
  const ci = recentCheckIns(ctx, crewId, 7);
  const headaches = symptomCount(ci, 'headache');
  const vision = ci.filter((c) => c.symptoms.includes('vision'));
  if (headaches < 3 && !vision.length) return null;
  const sysB = ctx.db.baseline(crewId, 'bpSys');
  const sys = recentMean(ctx, crewId, 'bpSys', 7);
  const evidence: Evidence[] = [
    { label: 'Headache reports, 7 days', value: `${headaches} of ${ci.length} check-ins`, direction: 'up' },
  ];
  let signals = 1;
  if (vision.length) {
    signals += 2;
    evidence.push({ label: 'Vision change reported', value: vision.map((v) => `D${v.day}`).join(', ') });
  }
  const accB = ctx.db.baseline(crewId, 'visionAcuity');
  const acc = lastAt(ctx.db.series(crewId, 'visionAcuity'), ctx.hour);
  if (accB && acc && acc.v < accB.low) {
    signals++;
    evidence.push({ label: 'Near visual acuity, latest check', value: formatMetric('visionAcuity', acc.v), reference: formatMetric('visionAcuity', accB.mean), metric: 'visionAcuity', crewId, direction: 'down' });
  }
  const congestion = symptomCount(ci, 'congestion');
  if (congestion) {
    signals++;
    evidence.push({ label: 'Congestion reports, 7 days', value: `${congestion}` });
  }
  if (sysB && sys > sysB.mean + 3) {
    signals++;
    evidence.push({ label: 'Systolic BP, 7-day resting mean', value: formatMetric('bpSys', sys), reference: formatMetric('bpSys', sysB.mean), metric: 'bpSys', crewId, direction: 'up' });
  }
  const who = name(ctx, crewId);
  const lastReport = ci.filter((c) => c.symptoms.length).at(-1);
  return {
    id: `fluid-shift:${crewId}`,
    crewId,
    severity: 'watch',
    hazards: ['gravity'],
    title: vision.length ? 'Headaches with vision change. SANS screen advised' : 'Recurring headaches',
    summary: `${who} reported headaches on ${headaches} of the last ${ci.length} check-ins${vision.length ? ` and a change in near vision on D${vision[0].day}` : ''}. Resting systolic pressure has crept up over the same period.`,
    whyItMatters:
      'Headache with vision change in microgravity can indicate spaceflight-associated neuro-ocular syndrome (SANS), caused by headward fluid shift. Early imaging lets the crew start countermeasures before changes become persistent.',
    detectedAt: lastReport?.at ?? ctx.hour,
    primaryMetric: 'bpSys',
    evidence,
    confidence: confidence(signals, 0.5),
    recommended: [
      { kind: 'message', label: 'Request ocular exam', detail: 'Ask for fundoscopy, Amsler grid and visual acuity tonight.' },
      { kind: 'escalate', label: 'Ophthalmology consult', detail: 'Queue imaging review with the Earth ophthalmologist.' },
      { kind: 'countermeasure', countermeasure: 'exercise', label: 'Add LBNP session', detail: 'Lower-body negative pressure, 30 min daily for 5 days.' },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────
const exerciseCompliance: Rule = (ctx, crewId) => {
  const today = hourToDay(ctx.hour);
  const sessions = ctx.db.exercise(crewId).filter((s) => s.day >= today - 14 && s.end <= ctx.hour);
  const missed = sessions.filter((s) => !s.done);
  if (missed.length < 4) return null;
  const bone = ctx.db.series(crewId, 'boneDensity');
  const lean = ctx.db.series(crewId, 'muscleMass');
  const bLast = lastAt(bone, ctx.hour);
  const lLast = lastAt(lean, ctx.hour);
  const bPct = bLast ? ((bLast.v - bone[0].v) / bone[0].v) * 100 : 0;
  const lPct = lLast ? ((lLast.v - lean[0].v) / lean[0].v) * 100 : 0;
  const who = name(ctx, crewId);
  return {
    id: `exercise:${crewId}`,
    crewId,
    severity: 'watch',
    hazards: ['gravity', 'isolation'],
    title: 'Exercise sessions missed',
    summary: `${who} completed ${sessions.length - missed.length} of ${sessions.length} scheduled exercise sessions in the last 14 days. Weekly bone and lean-mass measurements are now declining faster than the countermeasure target.`,
    whyItMatters:
      'Resistive exercise is the main countermeasure against microgravity bone and muscle loss. Lost mass is slow to recover and affects surface operations on arrival.',
    detectedAt: missed.at(-1)?.end ?? ctx.hour,
    primaryMetric: 'muscleMass',
    evidence: [
      { label: 'Sessions completed, 14 days', value: `${sessions.length - missed.length} / ${sessions.length}`, direction: 'down' },
      { label: 'Bone density since launch', value: formatPct(bPct, 1), reference: '−0.5%/mo target', metric: 'boneDensity', crewId, direction: 'down' },
      { label: 'Lean mass since launch', value: formatPct(lPct, 1), metric: 'muscleMass', crewId, direction: 'down' },
    ],
    confidence: 0.83,
    recommended: [
      { kind: 'countermeasure', countermeasure: 'exercise', label: 'Reschedule exercise', detail: 'Move sessions to a fixed morning slot with a crew partner.' },
      { kind: 'message', label: 'Ask about barriers', detail: 'Check whether workload, motivation or discomfort is the cause.' },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────
const boneOnTrack: Rule = (ctx, crewId) => {
  const bone = ctx.db.series(crewId, 'boneDensity');
  const last = lastAt(bone, ctx.hour);
  if (!last || !bone.length) return null;
  const pct = ((last.v - bone[0].v) / bone[0].v) * 100;
  const months = (last.t - bone[0].t) / H_PER_DAY / 30.44;
  if (months < 1 || pct / months < -0.42) return null;
  const who = name(ctx, crewId);
  return {
    id: `bone-on-track:${crewId}`,
    crewId,
    severity: 'info',
    hazards: ['gravity'],
    title: 'Bone loss within countermeasure target',
    summary: `${who}'s femoral neck density is ${formatPct(pct, 1)} since launch (${formatPct(pct / months, 2)}/month), inside the −0.5%/month target. Exercise compliance is consistent.`,
    whyItMatters: 'Confirms the current exercise prescription is working; useful as a reference for the rest of the crew.',
    detectedAt: last.t,
    primaryMetric: 'boneDensity',
    evidence: [
      { label: 'BMD change since launch', value: formatPct(pct, 1), metric: 'boneDensity', crewId, direction: 'down' },
      { label: 'Rate', value: `${formatPct(pct / months, 2)}/mo`, reference: '−0.50%/mo target' },
    ],
    confidence: 0.88,
    recommended: [{ kind: 'acknowledge', label: 'Acknowledge', detail: 'No action needed.' }],
  };
};

// ─────────────────────────────────────────────────────────────────────
const workloadHigh: Rule = (ctx, crewId) => {
  const b = ctx.db.baseline(crewId, 'workload');
  const w = lastAt(ctx.db.series(crewId, 'workload'), ctx.hour);
  if (!b || !w || w.v < 65 || w.v < b.high) return null;
  const who = name(ctx, crewId);
  const eva = nextEvaFor(ctx, crewId);
  return {
    id: `workload:${crewId}`,
    crewId,
    severity: 'info',
    hazards: ['distance', 'isolation'],
    title: eva ? `Workload high during ${eva.label.split(' ')[0]} prep` : 'Workload high',
    summary: `${who} rated workload ${w.v.toFixed(0)}/100 on the latest weekly questionnaire, above personal baseline (${b.mean.toFixed(0)}).`,
    whyItMatters: 'With signal delay, the crew carries more of the planning load. Sustained high workload erodes sleep and margin.',
    detectedAt: w.t,
    primaryMetric: 'workload',
    evidence: [{ label: 'Workload index', value: formatMetric('workload', w.v), reference: formatMetric('workload', b.mean), metric: 'workload', crewId, direction: 'up' }],
    confidence: 0.74,
    recommended: [{ kind: 'message', label: 'Offer task re-plan', detail: 'Ask which tasks can move after the EVA.' }],
  };
};

// ─────────────────────────────────────────────────────────────────────
/** Latest check-in flags anything new (mood ≤ 2 or a non-fluid-shift symptom) within 24 h. */
const checkInFlag: Rule = (ctx, crewId) => {
  const c = recentCheckIns(ctx, crewId, 1).at(-1);
  if (!c) return null;
  const flagged = c.symptoms.filter((s) => s === 'nausea' || s === 'other' || s === 'back-pain');
  const lowMood = c.mood <= 2;
  if (!flagged.length && !lowMood) return null;
  const who = name(ctx, crewId);
  const parts = [...flagged.map((s) => SYMPTOM_LABEL[s].toLowerCase()), ...(lowMood ? [`mood ${c.mood}/5`] : [])];
  return {
    id: `checkin:${crewId}:${c.day}`,
    crewId,
    severity: lowMood || flagged.includes('nausea') ? 'watch' : 'info',
    hazards: flagged.includes('back-pain') ? ['gravity'] : ['isolation'],
    title: `Check-in flag: ${parts.join(', ')}`,
    summary: `${who}'s D${c.day} check-in reports ${parts.join(' and ')}.${c.note ? ` Note: "${c.note}"` : ''}`,
    whyItMatters: 'Self-reports are the earliest signal for symptoms wearables cannot see.',
    detectedAt: c.at,
    primaryMetric: 'mood',
    evidence: [
      { label: 'Mood', value: `${c.mood}/5`, metric: 'mood', crewId },
      { label: 'Energy', value: `${c.energy}/5`, metric: 'energy', crewId },
      { label: 'Sleep quality', value: `${c.sleepQuality}/5`, metric: 'sleepQuality', crewId },
      ...(c.symptoms.length ? [{ label: 'Symptoms', value: c.symptoms.map((s) => SYMPTOM_LABEL[s]).join(', ') }] : []),
    ],
    confidence: 0.7,
    recommended: [{ kind: 'message', label: 'Follow up', detail: 'Ask for details at the next convenient break.' }],
  };
};

// ─────────────────────────────────────────────────────────────────────
function cabinCo2(ctx: EngineContext): Insight | null {
  const crew = ctx.db.crew();
  const per = crew.map((a) => ({ id: a.id, v: recentMean(ctx, a.id, 'co2', 2) }));
  const m = mean(per.map((p) => p.v));
  if (!(m > 3)) return null;
  const anomaly = ctx.db.events().find((e) => e.kind === 'anomaly' && e.start <= ctx.hour && e.end >= ctx.hour);
  const hours = anomaly ? Math.round(ctx.hour - anomaly.start) : 48;
  const headaches = crew.reduce((s, a) => s + symptomCount(recentCheckIns(ctx, a.id, 3), 'headache'), 0);
  return {
    id: 'co2:crew',
    crewId: null,
    severity: m >= 4 ? 'alert' : 'watch',
    hazards: ['environment'],
    title: `Cabin CO₂ above 3 mmHg for ${hours} h`,
    summary: `Crew CO₂ exposure has averaged ${m.toFixed(1)} mmHg over 48 h${anomaly ? ` (${anomaly.label}, D${hourToDay(anomaly.start)})` : ''}. ${headaches} headache reports across the crew in 3 days.`,
    whyItMatters: 'Chronic CO₂ above 3 mmHg is linked to headache, reduced cognitive performance and poorer sleep. All four crew are exposed.',
    detectedAt: anomaly ? anomaly.start + 6 : ctx.hour,
    primaryMetric: 'co2',
    evidence: per.map((p) => ({ label: `${name(ctx, p.id)}, 48 h mean`, value: formatMetric('co2', p.v), reference: '3.0 mmHg limit', metric: 'co2', crewId: p.id, direction: 'up' as const })),
    confidence: 0.9,
    recommended: [
      { kind: 'message', label: 'Crew ventilation advisory', detail: 'Increase fan speed in crew quarters; avoid sleeping near the galley.' },
      { kind: 'escalate', label: 'ECLSS engineering support', detail: 'Send scrubber bed telemetry to the Earth ECLSS team.' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────
/**
 * Nova safety alert. Gives the clinician what is needed to act: the specific signal
 * (a category, never the astronaut's words), timing, what Nova already did, context
 * from data the astronaut already shares, who can help on board, and a response protocol.
 */
function safetyInsight(ctx: EngineContext, f: SafetyFlag): Insight {
  const who = name(ctx, f.crewId);
  const medical = f.category === 'medical';
  const crew = ctx.db.crew();
  const cdr = crew.find((a) => a.role === 'CDR' && a.id !== f.crewId) ?? crew.find((a) => a.role === 'CMO' && a.id !== f.crewId);
  const cmo = crew.find((a) => a.role === 'CMO' && a.id !== f.crewId) ?? cdr;
  const helper = medical ? cmo : cdr;
  const director = MISSION_CONFIG.team.flightDirector;
  const delay = ctx.link.delaySeconds / 3600;
  const signal = SAFETY_SIGNAL_LABEL[f.signal];

  // Context from shared data (check-ins, wearables, schedule).
  const evidence: Evidence[] = [
    { label: 'Detected', value: `${who} ${signal}` },
    { label: 'When', value: `${formatMissionTime(f.at)} · reached Earth ${formatClock(f.at + delay)}` },
    {
      label: 'Nova already',
      value: medical
        ? `told ${who} to get ${cmo?.name ?? 'the crew medical officer'} now, stop exercise, and that you were alerted`
        : `gave crisis support, urged ${who} not to be alone, and told ${who} you were alerted`,
    },
  ];
  const moodB = ctx.db.baseline(f.crewId, 'mood');
  const mood = recentMean(ctx, f.crewId, 'mood', 7);
  if (Number.isFinite(mood)) {
    evidence.push({ label: 'Mood, 7-day mean', value: formatMetric('mood', mood), reference: moodB ? formatMetric('mood', moodB.mean) : undefined, metric: 'mood', crewId: f.crewId });
  }
  const sleep = recentMean(ctx, f.crewId, 'sleepDuration', 5);
  const sleepB = ctx.db.baseline(f.crewId, 'sleepDuration');
  if (Number.isFinite(sleep)) {
    evidence.push({ label: 'Sleep, last 5 nights', value: formatMetric('sleepDuration', sleep), reference: sleepB ? formatMetric('sleepDuration', sleepB.mean) : undefined, metric: 'sleepDuration', crewId: f.crewId });
  }
  const hrv = recentMean(ctx, f.crewId, 'hrv', 7);
  const hrvB = ctx.db.baseline(f.crewId, 'hrv');
  if (Number.isFinite(hrv)) {
    evidence.push({ label: 'HRV, 7-day resting', value: formatMetric('hrv', hrv), reference: hrvB ? formatMetric('hrv', hrvB.mean) : undefined, metric: 'hrv', crewId: f.crewId });
  }
  const missed = missedCheckInDays(ctx, f.crewId, 7).length;
  evidence.push({ label: 'Missed check-ins, 7 days', value: `${missed}` });
  const eva = nextEvaFor(ctx, f.crewId);
  const evaDays = eva ? Math.ceil((eva.start - ctx.hour) / H_PER_DAY) : null;
  if (eva && evaDays !== null && evaDays <= 7) evidence.push({ label: 'Upcoming', value: `${eva.label.split(' ')[0]} in ${evaDays} d` });
  if (helper) evidence.push({ label: 'On board to help', value: `${helper.name} (${helper.role})` });

  const recommended: RecommendedAction[] = medical
    ? [
        { kind: 'escalate', log: 'in-person', label: `Ask ${cmo?.name ?? 'the CMO'} to assess ${who} now`, detail: 'In-person assessment on board; do not wait for Earth.' },
        { kind: 'message', label: `Message ${who}`, detail: 'Acknowledge the symptoms and ask for a voice call at the next window.' },
        { kind: 'escalate', log: 'medical', label: 'Request Earth medical consult', detail: 'Specialist review of symptoms and onboard findings.' },
        { kind: 'countermeasure', countermeasure: 'rest', label: 'Stop exercise and hazardous tasks', detail: `Pause exercise${eva ? ` and ${eva.label.split(' ')[0]} duties` : ''} until cleared.` },
        { kind: 'escalate', label: `Escalate to ${director}`, detail: 'Flight director decides on schedule changes.' },
      ]
    : [
        { kind: 'message', label: `Message ${who} now`, detail: `Let ${who} know you got the alert and ask for a call at the next window. Arrives after the signal delay.` },
        { kind: 'escalate', log: 'in-person', label: `Ask ${cdr?.name ?? 'a crewmate'} to check on ${who} in person`, detail: `${who} should not be alone right now.` },
        { kind: 'escalate', log: 'psych', label: 'Book urgent psychologist conference', detail: 'Private conference with the Earth psychologist at the next window.' },
        ...(eva && evaDays !== null && evaDays <= 7
          ? [{ kind: 'countermeasure' as const, countermeasure: 'rest' as const, label: `Review ${eva.label.split(' ')[0]} assignment`, detail: `Hold ${who}’s role until assessed.` }]
          : []),
        { kind: 'escalate', label: `Escalate to ${director}`, detail: 'Flight director decides on schedule changes.' },
      ];

  return {
    id: `safety:${f.id}`,
    crewId: f.crewId,
    severity: 'alert',
    hazards: medical ? ['distance'] : ['isolation', 'distance'],
    title: `Urgent: ${who} ${signal}`,
    summary:
      `In a private Nova conversation at ${formatClock(f.at)}, ${who} ${signal}. ` +
      `Nova responded and told ${who} that you were alerted. ` +
      (medical ? `Get ${cmo?.name ?? 'the crew medical officer'} to ${who} now.` : `Contact ${who} now and make sure ${who} is not alone.`),
    whyItMatters:
      `${medical ? 'These symptoms can signal a life-threatening emergency' : 'This is a risk to life'}, and help from Earth is ${formatDelay(ctx.link.delaySeconds)} away each way. ` +
      `The conversation stays private: Nova shares only the type of risk, which ${who} agreed to before first use.`,
    detectedAt: f.at,
    evidence,
    confidence: 0.95,
    recommended,
  };
}

// ─────────────────────────────────────────────────────────────────────
/**
 * Findings that come from crew mode: Nova safety flags (no transcript, by design),
 * notes the astronaut chose to share, and completed questionnaires.
 */
function crewModeInsights(ctx: EngineContext): Insight[] {
  const out: Insight[] = [];
  const surgeon = MISSION_CONFIG.team.flightSurgeon;

  // Include the current quarter-hour: analysis runs per quarter, alerts carry their exact time.
  for (const f of ctx.db.safetyFlags().filter((x) => x.at <= ctx.hour + 0.25)) out.push(safetyInsight(ctx, f));

  for (const n of ctx.db.sharedNotes().filter((x) => x.at <= ctx.hour + 0.25)) {
    const who = name(ctx, n.crewId);
    out.push({
      id: `note:${n.id}`,
      crewId: n.crewId,
      severity: 'info',
      hazards: ['isolation'],
      title: `${who} shared a note with you`,
      summary: `“${n.text}”`,
      whyItMatters: `${who} chose to share this from a private Nova conversation. Only this text was shared.`,
      detectedAt: n.at,
      evidence: [{ label: 'Source', value: 'Shared from Nova by the astronaut' }],
      confidence: 1,
      recommended: [{ kind: 'message', label: 'Reply', detail: `Thank ${who} and follow up at a convenient time.` }],
    });
  }

  for (const a of ctx.db.assignments().filter((x) => x.status === 'done' && (x.completedAt ?? 0) <= ctx.hour)) {
    const q = QUESTIONNAIRES[a.questionnaireId];
    const who = name(ctx, a.crewId);
    const score = a.score ?? 0;
    const band = score >= 60 ? 'high strain' : score >= 35 ? 'some strain' : 'low strain';
    const comment = q.questions.filter((x) => x.kind === 'text').map((x) => a.answers[x.id]).find((v) => typeof v === 'string' && v.trim());
    out.push({
      id: `q:${a.id}`,
      crewId: a.crewId,
      severity: score >= 60 ? 'watch' : 'info',
      hazards: q.hazards,
      title: `${q.title} questionnaire: ${band}`,
      summary: `${who} completed the ${q.title.toLowerCase()} questionnaire. Score ${score}/100 (higher means ${q.scoreMeaning}).`,
      whyItMatters: q.purpose,
      detectedAt: a.completedAt ?? ctx.hour,
      primaryMetric: q.feeds,
      evidence: [
        { label: 'Score', value: `${score}/100`, metric: q.feeds, crewId: a.crewId },
        ...(comment ? [{ label: 'Comment', value: `“${comment}”` }] : []),
      ],
      confidence: 0.8,
      recommended: [{ kind: 'acknowledge', label: 'Acknowledge', detail: 'Review the answers and follow up if needed.' }],
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
/** Latest mobility & balance check flagged a test (backend rule G.mobility). */
const mobilityCheck: Rule = (ctx, crewId) => {
  const checks = ctx.db.mobilityChecks(crewId);
  const m = mobilityAt(checks, ctx.hour + 0.25); // include checks since the last quarter-hour
  if (!m || m.status === 'nominal') return null;
  const last = checks.filter((c) => c.reliable && (c.at ?? 0) <= ctx.hour + 0.25).at(-1);
  const who = name(ctx, crewId);
  const flagged = m.tests.filter((t) => t.status !== 'nominal');
  const fmt = (t: (typeof m.tests)[number]): Evidence => {
    const [k, v] = Object.entries(t.values)[0];
    const unit = k.endsWith('_deg') ? '°' : ' s';
    const base = t.baseline?.[k];
    const dp = k.endsWith('_deg') ? 0 : 1;
    return {
      label: t.label,
      value: `${v.toFixed(dp)}${unit}`,
      reference: base !== undefined ? `first check ${base.toFixed(dp)}${unit}` : undefined,
      direction: t.status === 'nominal' ? 'flat' : k === 'sit_to_stand_5x_s' ? 'up' : 'down',
    };
  };
  return {
    id: `mobility:${crewId}`,
    crewId,
    severity: m.status === 'alert' ? 'alert' : 'watch',
    hazards: ['gravity'],
    title: 'Movement check flagged',
    summary: `${who}'s mobility & balance check on D${m.lastCheckDay} flagged ${flagged.map((t) => t.label.toLowerCase()).join(' and ')}. ${flagged.map((t) => t.note).join(' ')}`,
    whyItMatters: 'Reduced balance or leg strength raises fall and injury risk on arrival, when gravity returns. The check measures movement only, not bone health.',
    detectedAt: last?.at ?? ctx.hour,
    evidence: m.tests.map(fmt),
    confidence: 0.7,
    recommended: [
      { kind: 'countermeasure', countermeasure: 'exercise', label: 'Review exercise plan', detail: 'Add balance and leg-strength work to the resistive exercise sessions.' },
      { kind: 'message', label: 'Ask to repeat the check', detail: 'Repeat the mobility check within 3 days, side-on, in good light.' },
    ],
  };
};

const RULES: Rule[] = [sleepDebt, isolationStress, radiationOutlier, fluidShift, exerciseCompliance, boneOnTrack, workloadHigh, checkInFlag, mobilityCheck];

export function detectInsights(ctx: EngineContext): Insight[] {
  const out: Insight[] = [];
  for (const a of ctx.db.crew()) {
    for (const r of RULES) {
      const i = r(ctx, a.id);
      if (i) out.push(i);
    }
  }
  const co2 = cabinCo2(ctx);
  if (co2) out.push(co2);
  out.push(...crewModeInsights(ctx));
  // Nova safety alerts always come first: someone needs help now.
  const urgent = (i: Insight) => (i.id.startsWith('safety:') ? 1 : 0);
  return out.sort(
    (x, y) => urgent(y) - urgent(x) || SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || y.detectedAt - x.detectedAt,
  );
}
