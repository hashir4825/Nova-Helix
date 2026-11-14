import { CheckIn, MetricKey, Sample, Symptom } from '../models';
import { ArNoise, Rng, clamp } from './prng';
import {
  CrewId,
  GENERATED_DAYS,
  GENERATED_HOURS,
  MISSION_EVENTS,
  at,
  hourToDay,
} from './mission-plan';
import { PERSONAS, Persona, storyValue } from './personas';

export interface ExerciseSession {
  day: number;
  start: number;
  end: number;
  done: boolean;
}

export interface CrewBundle {
  crewId: CrewId;
  /** Generated series for every metric except check-in derived ones (mood/energy/sleepQuality). */
  series: Map<MetricKey, Sample[]>;
  checkIns: CheckIn[];
  exercise: ExerciseSession[];
  /** Per-hour activity context (index = mission hour). */
  asleep: Float32Array;
  exerciseLoad: Float32Array;
  eva: Float32Array;
}

const SPE_DAYS = new Set([97, 98]);
const DAYS_PER_MONTH = 30.44;

function evaDaysFor(crewId: string): Set<number> {
  return new Set(
    MISSION_EVENTS.filter((e) => e.kind === 'eva' && e.crewIds.includes(crewId)).map((e) => hourToDay(e.start)),
  );
}

function sleepStartFor(p: Persona, nightOfDay: number): number {
  // Ahmad's planned sleep shift for EVA-3 prep: nights D136–D144 start 2 h earlier.
  if (p.astronaut.id === 'ahmad' && nightOfDay >= 136 && nightOfDay <= 144) return p.astronaut.sleepStartHour - 2;
  return p.astronaut.sleepStartHour;
}

/** Spread a [start, end) interval over hourly buckets as fractional coverage. */
function paint(arr: Float32Array, start: number, end: number, weight = 1): void {
  for (let h = Math.max(0, Math.floor(start)); h < Math.min(arr.length, Math.ceil(end)); h++) {
    const overlap = Math.min(end, h + 1) - Math.max(start, h);
    if (overlap > 0) arr[h] = Math.min(1, arr[h] + overlap * weight);
  }
}

const round = (v: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export function generateCrew(crewId: CrewId): CrewBundle {
  const p = PERSONAS[crewId];
  const P = p.params;
  const rng = new Rng(`nhx-1:${crewId}`);
  const evaDays = evaDaysFor(crewId);

  const asleep = new Float32Array(GENERATED_HOURS);
  const exerciseLoad = new Float32Array(GENERATED_HOURS);
  const eva = new Float32Array(GENERATED_HOURS);
  const shelter = new Float32Array(GENERATED_HOURS);

  const series = new Map<MetricKey, Sample[]>();
  const push = (k: MetricKey, t: number, v: number) => {
    let arr = series.get(k);
    if (!arr) series.set(k, (arr = []));
    arr.push({ t, v });
  };

  // ── Daily layer: sleep, exercise, dose, CO₂, musculoskeletal, questionnaires ──
  const sleepNoise = new ArNoise(rng, 0.38, 0.35);
  const effNoise = new ArNoise(rng, 2.4, 0.35);
  const co2Noise = new ArNoise(rng, 0.16, 0.5);
  let cumulativeDose = 0;
  let boneLossPct = 0;
  let leanLossPct = 0;

  for (let d = 1; d <= GENERATED_DAYS; d++) {
    // Night ending on the morning of day d starts the evening of day d-1.
    const start = at(d - 1, sleepStartFor(p, d - 1));
    let dur = P.sleepH + storyValue(p, 'sleepH', d) + sleepNoise.step();
    let eff = P.sleepEff + storyValue(p, 'sleepEff', d) + effNoise.step();
    if (d === 97) {
      dur -= crewId === 'sabaina' ? 3.1 : 2.4; // SPE alarm at 03:00
      eff -= 14;
    } else if (d === 98) {
      dur -= 1.6; // night in storm shelter
      eff -= 12;
    } else if (evaDays.has(d - 1)) {
      dur += 0.5; // recovery night after EVA
    }
    if (d <= 4) {
      dur -= 1.0 - d * 0.2; // space adaptation
      eff -= 8 - d * 2;
    }
    dur = clamp(dur, 3.2, 9.5);
    eff = clamp(eff, 58, 97);
    if (d === 97) {
      paint(asleep, start, at(97, 3));
    } else {
      paint(asleep, start, start + dur);
    }
    const wake = d === 97 ? at(97, 3) : start + dur;
    if (d > 1) {
      push('sleepDuration', wake, round(dur, 2));
      push('sleepEfficiency', wake, round(eff, 1));
    }

    // Exercise (skipped on EVA and SPE days, and by compliance)
    const skipP = P.exerciseSkip + storyValue(p, 'exerciseSkip', d);
    const exStart = at(d, p.astronaut.exerciseHour);
    const forcedSkip = p.skippedExercise?.includes(d) ?? false;
    const done = !evaDays.has(d) && !SPE_DAYS.has(d) && !rng.chance(skipP) && !forcedSkip;
    if (d > 2 && done) {
      paint(exerciseLoad, exStart, exStart + 1, 1);
      paint(exerciseLoad, exStart + 1, exStart + 1.5, 0.5);
    }

    // Radiation: cumulative effective dose at start of day d
    push('radDose', at(d, 0), round(cumulativeDose, 2));
    let daily = 1.78 * P.shield * (1 + 0.04 * rng.gauss());
    if (evaDays.has(d)) daily += 0.35;
    if (d === 97) daily += P.speDose * 0.82;
    if (d === 98) daily += P.speDose * 0.18;
    cumulativeDose += daily;

    // Personal CO₂ exposure (24 h mean), scrubber degradation from D140
    let co2 = 2.45 + P.co2Offset + co2Noise.step();
    if (d >= 140) co2 += 0.85 + (d - 140) * 0.12;
    if (d === 61 || d === 62) co2 += 0.45;
    push('co2', at(d, 12), round(clamp(co2, 1.4, 5.5), 2));

    // Musculoskeletal: integrate daily loss, measure weekly
    boneLossPct += (P.boneRate + storyValue(p, 'boneRateExtra', d)) / DAYS_PER_MONTH;
    leanLossPct += (P.leanRate + storyValue(p, 'leanRateExtra', d)) / DAYS_PER_MONTH;
    if (d % 7 === 1) {
      push('boneDensity', at(d, 9), round(P.bmd * (1 - boneLossPct / 100) + rng.gauss() * 0.003, 4));
      push('muscleMass', at(d, 9), round(P.lean * (1 - leanLossPct / 100) + rng.gauss() * 0.18, 2));
    }

    // Weekly questionnaires
    if (d % 7 === 0) {
      const speBump = d === 98 ? 12 : 0;
      push('stress', at(d, 19), round(clamp(P.stress + storyValue(p, 'stress', d) + rng.gauss() * 4.5 + speBump, 0, 100), 0));
      push('workload', at(d, 19), round(clamp(P.workload + storyValue(p, 'workload', d) + rng.gauss() * 4.5 + speBump * 0.5, 0, 100), 0));
    }
  }

  // EVA and storm-shelter windows
  for (const e of MISSION_EVENTS) {
    if (e.kind === 'eva' && e.crewIds.includes(crewId)) paint(eva, e.start, e.end);
    if (e.kind === 'spe') paint(shelter, e.start, e.end);
  }

  // Exercise sessions list
  const exercise: ExerciseSession[] = [];
  for (let d = 3; d <= GENERATED_DAYS; d++) {
    const start = at(d, p.astronaut.exerciseHour);
    exercise.push({ day: d, start, end: start + 1.5, done: exerciseLoad[Math.floor(start)] > 0.5 });
  }

  // ── Hourly vitals ──
  const n = {
    hr: new ArNoise(rng, 2.2),
    hrv: new ArNoise(rng, 0.07),
    spo2: new ArNoise(rng, 0.35, 0.5),
    temp: new ArNoise(rng, 0.06),
    sys: new ArNoise(rng, 3),
    dia: new ArNoise(rng, 2.2),
    resp: new ArNoise(rng, 0.7, 0.5),
  };
  for (let h = 0; h < GENERATED_HOURS; h++) {
    const d = hourToDay(h);
    const hod = h % 24;
    const circ = Math.cos((2 * Math.PI * (hod - 17)) / 24); // peak late afternoon
    const s = asleep[h];
    const awake = 1 - s;
    const ex = exerciseLoad[h];
    const ev = eva[h];
    const sh = shelter[h];
    const adapt = d <= 14 ? 1 - d / 14 : 0;
    const warm = Math.min(1, d / 60);

    const hr = P.hr + 3 * circ + 6 * awake - 5 * s + 42 * ex + 22 * ev + 6 * sh + 6 * adapt + storyValue(p, 'hr', d) + n.hr.step();
    const hrvFactor = (1 + 0.22 * s - 0.45 * ex - 0.3 * ev - 0.15 * sh) * (1 + storyValue(p, 'hrvPct', d));
    const hrv = P.hrv * hrvFactor * (1 + n.hrv.step());
    const spo2 = P.spo2 + 0.3 - 0.8 * ex - 0.4 * s + n.spo2.step();
    const temp = P.temp + 0.3 * circ + 0.5 * ex + 0.3 * ev - 0.2 * s + 0.2 * warm + n.temp.step();
    const sys = P.sys + 3 * circ + 4 * awake - 9 * s + 22 * ex + 10 * ev + storyValue(p, 'sys', d) + n.sys.step();
    const dia = P.dia + 2 * circ + 3 * awake - 7 * s + 4 * ex + 5 * ev + storyValue(p, 'dia', d) + n.dia.step();
    const resp = P.resp + 0.5 * circ - 2 * s + 9 * ex + 4 * ev + storyValue(p, 'resp', d) + n.resp.step();

    push('hr', h, round(clamp(hr, 38, 175), 1));
    push('hrv', h, round(clamp(hrv, 8, 150), 1));
    push('spo2', h, round(clamp(spo2, 90, 100), 1));
    push('coreTemp', h, round(clamp(temp, 35.8, 39.5), 2));
    push('bpSys', h, round(clamp(sys, 85, 175), 1));
    push('bpDia', h, round(clamp(dia, 48, 110), 1));
    push('resp', h, round(clamp(resp, 8, 34), 1));
  }

  // ── Daily check-ins ──
  const checkIns: CheckIn[] = [];
  const sleepSamples = series.get('sleepDuration') ?? [];
  const missed = new Set(p.missedCheckIns);
  for (const s of sleepSamples) {
    const d = hourToDay(s.t);
    if (missed.has(d)) {
      rng.next();
      continue;
    }
    const t = round(s.t + 0.6 + rng.next() * 0.7, 3);
    const spe = SPE_DAYS.has(d) ? -0.7 : 0;
    const scale = (base: number, ch: 'mood' | 'energy' | 'sleepQuality') =>
      clamp(Math.round(base + storyValue(p, ch, d) + spe + rng.gauss() * 0.45), 1, 5);
    const symptoms: Symptom[] = p.symptoms[d] ?? [];
    checkIns.push({
      id: `ci-${crewId}-${d}`,
      crewId,
      day: d,
      at: t,
      mood: scale(P.mood, 'mood'),
      sleepQuality: scale(P.sleepQuality, 'sleepQuality'),
      energy: scale(P.energy, 'energy'),
      symptoms,
      note: p.notes[d],
    });
  }

  return { crewId, series, checkIns, exercise, asleep, exerciseLoad, eva };
}
