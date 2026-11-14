import { HazardKey } from './hazard';

export type MetricKey =
  // Vitals (hourly)
  | 'hr'
  | 'hrv'
  | 'spo2'
  | 'coreTemp'
  | 'bpSys'
  | 'bpDia'
  | 'resp'
  // Sleep (daily)
  | 'sleepDuration'
  | 'sleepEfficiency'
  // Radiation (daily, cumulative)
  | 'radDose'
  // Musculoskeletal (weekly)
  | 'boneDensity'
  | 'muscleMass'
  // Behavioral (check-in daily / questionnaire weekly)
  | 'mood'
  | 'energy'
  | 'sleepQuality'
  | 'stress'
  | 'workload'
  // Environment (daily exposure)
  | 'co2';

export type MetricGroup = 'vitals' | 'sleep' | 'radiation' | 'musculoskeletal' | 'behavioral' | 'environment';
export type Cadence = 'hourly' | 'daily' | 'weekly';

/** Which direction away from baseline is a concern. */
export type ConcernDirection = 'high' | 'low' | 'both';

export interface Threshold {
  value: number;
  level: 'watch' | 'alert';
  direction: 'above' | 'below';
}

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  group: MetricGroup;
  cadence: Cadence;
  hazards: HazardKey[];
  concern: ConcernDirection;
  thresholds: Threshold[];
  /** Hard display range for charts (y axis). */
  range: [number, number];
  source: string;
}

/** A sample at a mission hour (0 = launch). */
export interface Sample {
  t: number;
  v: number;
}

export interface MetricSeries {
  crewId: string;
  metric: MetricKey;
  samples: Sample[];
}

export interface LiveVitals {
  crewId: string;
  /** Fractional mission hour of the reading. */
  t: number;
  values: Partial<Record<MetricKey, number>>;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  hr: {
    key: 'hr', label: 'Heart rate', short: 'HR', unit: 'bpm', decimals: 0, group: 'vitals', cadence: 'hourly',
    hazards: ['gravity'], concern: 'both', range: [35, 160], source: 'Chest-strap ECG',
    thresholds: [
      { value: 110, level: 'watch', direction: 'above' },
      { value: 40, level: 'watch', direction: 'below' },
    ],
  },
  hrv: {
    key: 'hrv', label: 'Heart rate variability', short: 'HRV', unit: 'ms', decimals: 0, group: 'vitals', cadence: 'hourly',
    hazards: ['isolation', 'gravity'], concern: 'low', range: [0, 140], source: 'ECG RMSSD, 5-min windows',
    thresholds: [{ value: 25, level: 'watch', direction: 'below' }],
  },
  spo2: {
    key: 'spo2', label: 'Blood oxygen', short: 'SpO₂', unit: '%', decimals: 0, group: 'vitals', cadence: 'hourly',
    hazards: ['environment'], concern: 'low', range: [88, 100], source: 'Finger pulse oximeter',
    thresholds: [
      { value: 94, level: 'watch', direction: 'below' },
      { value: 92, level: 'alert', direction: 'below' },
    ],
  },
  coreTemp: {
    key: 'coreTemp', label: 'Core temperature', short: 'TEMP', unit: '°C', decimals: 1, group: 'vitals', cadence: 'hourly',
    hazards: ['environment'], concern: 'high', range: [35.5, 39.5], source: 'Dual-sensor forehead patch',
    thresholds: [
      { value: 38.0, level: 'watch', direction: 'above' },
      { value: 38.5, level: 'alert', direction: 'above' },
    ],
  },
  bpSys: {
    key: 'bpSys', label: 'Blood pressure, systolic', short: 'SYS', unit: 'mmHg', decimals: 0, group: 'vitals', cadence: 'hourly',
    hazards: ['gravity'], concern: 'both', range: [80, 170], source: 'Cuffless PPG, cuff-calibrated daily',
    thresholds: [
      { value: 140, level: 'watch', direction: 'above' },
      { value: 160, level: 'alert', direction: 'above' },
    ],
  },
  bpDia: {
    key: 'bpDia', label: 'Blood pressure, diastolic', short: 'DIA', unit: 'mmHg', decimals: 0, group: 'vitals', cadence: 'hourly',
    hazards: ['gravity'], concern: 'both', range: [45, 110], source: 'Cuffless PPG, cuff-calibrated daily',
    thresholds: [{ value: 90, level: 'watch', direction: 'above' }],
  },
  resp: {
    key: 'resp', label: 'Respiration rate', short: 'RESP', unit: 'br/min', decimals: 0, group: 'vitals', cadence: 'hourly',
    hazards: ['environment'], concern: 'high', range: [6, 36], source: 'Chest-strap impedance',
    thresholds: [{ value: 22, level: 'watch', direction: 'above' }],
  },
  sleepDuration: {
    key: 'sleepDuration', label: 'Sleep duration', short: 'SLEEP', unit: 'h', decimals: 1, group: 'sleep', cadence: 'daily',
    hazards: ['isolation', 'environment'], concern: 'low', range: [3, 10], source: 'Actigraphy + ECG staging',
    thresholds: [
      { value: 6, level: 'watch', direction: 'below' },
      { value: 5, level: 'alert', direction: 'below' },
    ],
  },
  sleepEfficiency: {
    key: 'sleepEfficiency', label: 'Sleep efficiency', short: 'EFF', unit: '%', decimals: 0, group: 'sleep', cadence: 'daily',
    hazards: ['environment', 'isolation'], concern: 'low', range: [50, 100], source: 'Actigraphy + ECG staging',
    thresholds: [{ value: 80, level: 'watch', direction: 'below' }],
  },
  radDose: {
    key: 'radDose', label: 'Cumulative effective dose', short: 'DOSE', unit: 'mSv', decimals: 0, group: 'radiation', cadence: 'daily',
    hazards: ['radiation'], concern: 'high', range: [0, 600], source: 'Personal active dosimeter',
    thresholds: [
      { value: 450, level: 'watch', direction: 'above' },
      { value: 600, level: 'alert', direction: 'above' },
    ],
  },
  boneDensity: {
    key: 'boneDensity', label: 'Bone mineral density, femoral neck', short: 'BMD', unit: 'g/cm²', decimals: 3, group: 'musculoskeletal', cadence: 'weekly',
    hazards: ['gravity'], concern: 'low', range: [0.85, 1.15], source: 'Onboard ultrasound densitometry',
    thresholds: [],
  },
  muscleMass: {
    key: 'muscleMass', label: 'Lean muscle mass', short: 'LEAN', unit: 'kg', decimals: 1, group: 'musculoskeletal', cadence: 'weekly',
    hazards: ['gravity'], concern: 'low', range: [40, 70], source: 'Bioimpedance + mass measurement device',
    thresholds: [],
  },
  mood: {
    key: 'mood', label: 'Mood', short: 'MOOD', unit: '/5', decimals: 1, group: 'behavioral', cadence: 'daily',
    hazards: ['isolation'], concern: 'low', range: [1, 5], source: 'Daily check-in',
    thresholds: [{ value: 2.5, level: 'watch', direction: 'below' }],
  },
  energy: {
    key: 'energy', label: 'Energy', short: 'ENRG', unit: '/5', decimals: 1, group: 'behavioral', cadence: 'daily',
    hazards: ['isolation'], concern: 'low', range: [1, 5], source: 'Daily check-in',
    thresholds: [{ value: 2.5, level: 'watch', direction: 'below' }],
  },
  sleepQuality: {
    key: 'sleepQuality', label: 'Sleep quality (self-rated)', short: 'SQ', unit: '/5', decimals: 1, group: 'behavioral', cadence: 'daily',
    hazards: ['isolation', 'environment'], concern: 'low', range: [1, 5], source: 'Daily check-in',
    thresholds: [{ value: 2.5, level: 'watch', direction: 'below' }],
  },
  stress: {
    key: 'stress', label: 'Stress index', short: 'STRS', unit: '/100', decimals: 0, group: 'behavioral', cadence: 'weekly',
    hazards: ['isolation', 'distance'], concern: 'high', range: [0, 100], source: 'Weekly wellbeing questionnaire',
    thresholds: [
      { value: 60, level: 'watch', direction: 'above' },
      { value: 75, level: 'alert', direction: 'above' },
    ],
  },
  workload: {
    key: 'workload', label: 'Workload index', short: 'WKLD', unit: '/100', decimals: 0, group: 'behavioral', cadence: 'weekly',
    hazards: ['distance', 'isolation'], concern: 'high', range: [0, 100], source: 'Weekly workload questionnaire',
    thresholds: [{ value: 70, level: 'watch', direction: 'above' }],
  },
  co2: {
    key: 'co2', label: 'CO₂ exposure, partial pressure', short: 'CO₂', unit: 'mmHg', decimals: 1, group: 'environment', cadence: 'daily',
    hazards: ['environment'], concern: 'high', range: [1, 6], source: 'Crew-worn CO₂ monitor',
    thresholds: [
      { value: 3, level: 'watch', direction: 'above' },
      { value: 4, level: 'alert', direction: 'above' },
    ],
  },
};

export const VITAL_KEYS: readonly MetricKey[] = ['hr', 'hrv', 'spo2', 'coreTemp', 'bpSys', 'bpDia', 'resp'];
/** Vitals shown on the Mission Control crew card. */
export const CARD_VITALS: readonly MetricKey[] = ['hr', 'hrv', 'spo2'];
