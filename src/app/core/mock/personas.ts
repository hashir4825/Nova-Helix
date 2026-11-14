import { Astronaut, Symptom } from '../models';
import { CrewId } from './mission-plan';

/** Generator parameters per astronaut. Values are resting / typical, not population norms. */
export interface PersonaParams {
  hr: number;
  hrv: number;
  spo2: number;
  temp: number;
  sys: number;
  dia: number;
  resp: number;
  sleepH: number;
  sleepEff: number;
  mood: number;
  energy: number;
  sleepQuality: number;
  stress: number;
  workload: number;
  bmd: number;
  lean: number;
  /** Shielding factor of assigned quarters/work modules (1 = nominal). */
  shield: number;
  /** Extra dose during the Day 97 solar particle event, mSv. */
  speDose: number;
  co2Offset: number;
  /** %/month bone and lean mass loss with full countermeasure compliance. */
  boneRate: number;
  leanRate: number;
  /** Probability of skipping a scheduled exercise session. */
  exerciseSkip: number;
}

/** A linear ramp from `from` to `to` day, reaching `delta`, held afterwards. */
export interface Ramp {
  from: number;
  to: number;
  delta: number;
}

export type StoryChannel =
  | 'hr' | 'hrvPct' | 'sys' | 'dia' | 'resp'
  | 'sleepH' | 'sleepEff'
  | 'mood' | 'energy' | 'sleepQuality' | 'stress' | 'workload'
  | 'boneRateExtra' | 'leanRateExtra' | 'exerciseSkip';

export interface Persona {
  astronaut: Astronaut;
  params: PersonaParams;
  story: Partial<Record<StoryChannel, Ramp[]>>;
  /** Planted symptom reports by mission day. */
  symptoms: Record<number, Symptom[]>;
  notes: Record<number, string>;
  missedCheckIns: number[];
  /** Planted skipped exercise sessions by mission day. */
  skippedExercise?: number[];
}

export const PERSONAS: Record<CrewId, Persona> = {
  // Steady, highly adapted. Reference case: everything nominal.
  okafor: {
    astronaut: {
      id: 'okafor', givenName: 'Adaeze', familyName: 'Okafor', role: 'CDR', callsign: 'KESTREL',
      age: 46, agency: 'NASA', sleepStartHour: 22, exerciseHour: 6,
      persona: 'Third long-duration flight. Former test pilot. Very consistent sleep and exercise compliance.',
    },
    params: {
      hr: 54, hrv: 68, spo2: 98, temp: 36.8, sys: 114, dia: 72, resp: 13,
      sleepH: 7.2, sleepEff: 91, mood: 4.1, energy: 4.0, sleepQuality: 4.0, stress: 28, workload: 48,
      bmd: 1.042, lean: 58.6, shield: 0.97, speDose: 27, co2Offset: 0, boneRate: 0.33, leanRate: 0.25, exerciseSkip: 0.03,
    },
    story: {},
    symptoms: { 2: ['nausea', 'congestion'], 3: ['congestion'], 21: ['congestion'] },
    notes: { 98: 'Shelter night was loud. Fine otherwise.' },
    missedCheckIns: [],
  },

  // Storyline: sleep degrading ahead of EVA-3 (sleep shift + workload).
  lindqvist: {
    astronaut: {
      id: 'lindqvist', givenName: 'Jonas', familyName: 'Lindqvist', role: 'FE', callsign: 'TORQUE',
      age: 39, agency: 'ESA', sleepStartHour: 23, exerciseHour: 16,
      persona: 'Systems and EVA lead. Second flight. Tends to under-sleep during high-workload periods.',
    },
    params: {
      hr: 61, hrv: 52, spo2: 98, temp: 36.7, sys: 122, dia: 79, resp: 14,
      sleepH: 6.9, sleepEff: 88, mood: 3.9, energy: 3.8, sleepQuality: 3.8, stress: 34, workload: 55,
      bmd: 1.083, lean: 61.3, shield: 1.0, speDose: 29, co2Offset: 0.05, boneRate: 0.6, leanRate: 0.4, exerciseSkip: 0.05,
    },
    story: {
      sleepH: [{ from: 132, to: 142, delta: -1.7 }],
      sleepEff: [{ from: 132, to: 142, delta: -11 }],
      hr: [{ from: 133, to: 142, delta: 5 }],
      hrvPct: [{ from: 133, to: 142, delta: -0.16 }],
      sleepQuality: [{ from: 132, to: 142, delta: -1.5 }],
      energy: [{ from: 133, to: 142, delta: -1.1 }],
      mood: [{ from: 135, to: 142, delta: -0.4 }],
      workload: [{ from: 120, to: 142, delta: 21 }],
      stress: [{ from: 120, to: 142, delta: 10 }],
    },
    symptoms: { 2: ['nausea'], 3: ['headache'], 120: ['back-pain'], 131: ['back-pain'], 139: ['back-pain', 'headache'] },
    notes: { 139: 'EVA-3 procedures review ran late again.', 141: 'Woke up twice. Shift schedule is rough.' },
    missedCheckIns: [],
  },

  // Storyline: isolation stress rising, exercise compliance dropping.
  tanaka: {
    astronaut: {
      id: 'tanaka', givenName: 'Rei', familyName: 'Tanaka', role: 'MS', callsign: 'LANTERN',
      age: 34, agency: 'JAXA', sleepStartHour: 23, exerciseHour: 13,
      persona: 'First long-duration flight. Planetary geologist. Close family ties; private conferences now limited by delay.',
    },
    params: {
      hr: 65, hrv: 46, spo2: 97, temp: 36.9, sys: 110, dia: 70, resp: 15,
      sleepH: 7.0, sleepEff: 89, mood: 4.0, energy: 3.9, sleepQuality: 3.9, stress: 30, workload: 50,
      bmd: 0.981, lean: 47.8, shield: 0.98, speDose: 26, co2Offset: 0.05, boneRate: 0.7, leanRate: 0.5, exerciseSkip: 0.04,
    },
    story: {
      mood: [{ from: 112, to: 142, delta: -1.6 }],
      energy: [{ from: 112, to: 142, delta: -1.2 }],
      sleepQuality: [{ from: 115, to: 142, delta: -1.0 }],
      stress: [{ from: 105, to: 142, delta: 46 }],
      workload: [{ from: 105, to: 142, delta: 10 }],
      hr: [{ from: 112, to: 142, delta: 7 }],
      hrvPct: [{ from: 112, to: 142, delta: -0.24 }],
      sleepH: [{ from: 110, to: 142, delta: -0.9 }],
      sleepEff: [{ from: 112, to: 142, delta: -7 }],
      resp: [{ from: 115, to: 142, delta: 1.5 }],
      sys: [{ from: 115, to: 142, delta: 4 }],
      exerciseSkip: [{ from: 116, to: 120, delta: 0.5 }],
      boneRateExtra: [{ from: 118, to: 119, delta: 0.9 }],
      leanRateExtra: [{ from: 118, to: 119, delta: 1.1 }],
    },
    symptoms: { 2: ['nausea', 'headache'], 3: ['nausea'], 4: ['congestion'] },
    notes: { 124: 'Missing home more than expected.', 139: 'Tired. Fine.' },
    missedCheckIns: [129, 133, 136, 138, 141],
    skippedExercise: [131, 133, 136, 138, 140],
  },

  // Storyline: highest radiation dose (late to shelter on D97) + fluid-shift symptoms.
  ferreira: {
    astronaut: {
      id: 'ferreira', givenName: 'Sofia', familyName: 'Ferreira', role: 'CMO', callsign: 'MERIDIAN',
      age: 42, agency: 'NASA', sleepStartHour: 22, exerciseHour: 18,
      persona: 'Emergency physician. Crew medical officer. Entered storm shelter late on D97 securing the medical bay.',
    },
    params: {
      hr: 58, hrv: 60, spo2: 98, temp: 36.7, sys: 116, dia: 74, resp: 13,
      sleepH: 6.7, sleepEff: 90, mood: 4.2, energy: 4.0, sleepQuality: 4.0, stress: 26, workload: 52,
      bmd: 1.012, lean: 49.6, shield: 1.04, speDose: 58, co2Offset: 0.15, boneRate: 0.55, leanRate: 0.45, exerciseSkip: 0.04,
    },
    story: {
      sys: [{ from: 125, to: 142, delta: 7 }],
      dia: [{ from: 125, to: 142, delta: 4 }],
    },
    symptoms: {
      2: ['congestion'], 3: ['headache', 'congestion'],
      135: ['headache'], 137: ['headache', 'congestion'], 139: ['headache'], 140: ['headache', 'vision'],
      141: ['congestion'], 142: ['headache'],
    },
    notes: { 140: 'Near text looks slightly blurred in the evening. Self-exam unremarkable.' },
    missedCheckIns: [],
  },
};

/** Value of a story channel on a given day (sum of ramps). */
export function storyValue(p: Persona, channel: StoryChannel, day: number): number {
  const ramps = p.story[channel];
  if (!ramps) return 0;
  let v = 0;
  for (const r of ramps) {
    const f = r.to === r.from ? (day >= r.to ? 1 : 0) : (day - r.from) / (r.to - r.from);
    v += r.delta * Math.min(1, Math.max(0, f));
  }
  return v;
}
