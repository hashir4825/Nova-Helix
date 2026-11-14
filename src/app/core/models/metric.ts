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
  | 'co2'
  // M2 additions
  | 'doseRate'
  | 'reactionTime'
  | 'visionAcuity'
  | 'wbc'
  | 'lymphocytes'
  | 'boneMarker'
  | 'cabinNoise'
  | 'cabinTemp'
  | 'cabinHumidity'
  | 'legStrength'
  | 'medKit';

export type MetricGroup = 'vitals' | 'sleep' | 'radiation' | 'musculoskeletal' | 'behavioral' | 'environment' | 'medical' | 'operations';
export type Cadence = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'session';

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
  /** Clinical reference range (labs/tests only; shown alongside the personal baseline). */
  reference?: [number, number];
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
  doseRate: {
    key: 'doseRate', label: 'Radiation dose rate', short: 'RATE', unit: 'µSv/h', decimals: 0, group: 'radiation', cadence: 'hourly',
    hazards: ['radiation'], concern: 'high', range: [0, 2500], source: 'Personal active dosimeter',
    thresholds: [
      { value: 150, level: 'watch', direction: 'above' },
      { value: 500, level: 'alert', direction: 'above' },
    ],
  },
  reactionTime: {
    key: 'reactionTime', label: 'Reaction time', short: 'RT', unit: 'ms', decimals: 0, group: 'behavioral', cadence: 'weekly',
    hazards: ['radiation', 'isolation'], concern: 'high', range: [180, 420], source: 'Psychomotor vigilance test on tablet (3 min)',
    thresholds: [{ value: 320, level: 'watch', direction: 'above' }],
  },
  visionAcuity: {
    key: 'visionAcuity', label: 'Near visual acuity', short: 'VIS', unit: '', decimals: 2, group: 'medical', cadence: 'weekly',
    hazards: ['gravity'], concern: 'low', range: [0.4, 1.4], source: 'Tablet near-vision chart + Amsler grid',
    thresholds: [{ value: 0.8, level: 'watch', direction: 'below' }],
    reference: [0.8, 1.5],
  },
  wbc: {
    key: 'wbc', label: 'White blood cells', short: 'WBC', unit: '×10⁹/L', decimals: 1, group: 'medical', cadence: 'monthly',
    hazards: ['environment'], concern: 'both', range: [2, 12], source: 'Onboard blood analyzer',
    thresholds: [{ value: 4, level: 'watch', direction: 'below' }],
    reference: [4.0, 11.0],
  },
  lymphocytes: {
    key: 'lymphocytes', label: 'Lymphocytes', short: 'LYM', unit: '×10⁹/L', decimals: 2, group: 'medical', cadence: 'monthly',
    hazards: ['radiation', 'environment'], concern: 'low', range: [0.5, 3.5], source: 'Onboard blood analyzer',
    thresholds: [{ value: 1.0, level: 'watch', direction: 'below' }],
    reference: [1.0, 3.0],
  },
  boneMarker: {
    key: 'boneMarker', label: 'Bone breakdown marker (urine NTx)', short: 'NTX', unit: 'nM BCE/mM Cr', decimals: 0, group: 'medical', cadence: 'monthly',
    hazards: ['gravity'], concern: 'high', range: [10, 120], source: 'Onboard urine analyzer',
    thresholds: [{ value: 65, level: 'watch', direction: 'above' }],
    reference: [5, 65],
  },
  cabinNoise: {
    key: 'cabinNoise', label: 'Noise exposure', short: 'NOISE', unit: 'dBA', decimals: 0, group: 'environment', cadence: 'hourly',
    hazards: ['environment'], concern: 'high', range: [35, 80], source: 'Crew quarters acoustic sensor',
    thresholds: [{ value: 60, level: 'watch', direction: 'above' }],
  },
  cabinTemp: {
    key: 'cabinTemp', label: 'Cabin temperature', short: 'CABIN', unit: '°C', decimals: 1, group: 'environment', cadence: 'hourly',
    hazards: ['environment'], concern: 'both', range: [18, 28], source: 'Module thermal sensor',
    thresholds: [{ value: 26, level: 'watch', direction: 'above' }],
  },
  cabinHumidity: {
    key: 'cabinHumidity', label: 'Cabin humidity', short: 'RH', unit: '%', decimals: 0, group: 'environment', cadence: 'hourly',
    hazards: ['environment'], concern: 'both', range: [20, 75], source: 'Module humidity sensor',
    thresholds: [{ value: 60, level: 'watch', direction: 'above' }],
  },
  legStrength: {
    key: 'legStrength', label: 'Leg press strength (estimated max)', short: 'STR', unit: 'kg', decimals: 0, group: 'musculoskeletal', cadence: 'session',
    hazards: ['gravity'], concern: 'low', range: [60, 200], source: 'Resistive exercise device load cells',
    thresholds: [],
  },
  medKit: {
    key: 'medKit', label: 'Medical supply readiness', short: 'MED', unit: '%', decimals: 0, group: 'operations', cadence: 'weekly',
    hazards: ['distance'], concern: 'low', range: [50, 100], source: 'Pharmacy and medical kit inventory',
    thresholds: [{ value: 75, level: 'watch', direction: 'below' }],
  },
};

export const VITAL_KEYS: readonly MetricKey[] = ['hr', 'hrv', 'spo2', 'coreTemp', 'bpSys', 'bpDia', 'resp'];
/** Vitals shown on the Mission Control crew card. */
export const CARD_VITALS: readonly MetricKey[] = ['hr', 'hrv', 'spo2'];
/** Vitals on the profile's live strip (bpDia is shown together with bpSys). */
export const PROFILE_VITALS: readonly MetricKey[] = ['hr', 'hrv', 'spo2', 'coreTemp', 'bpSys', 'resp'];
