import { MissionConfig, MissionEvent } from '../models';

export const HOURS_PER_DAY = 24;
export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export const MISSION_DURATION_DAYS = 260;
/** The live mission is always on this day (clock time is real UTC). */
export const CURRENT_DAY = 142;
/** Generate a few days past "today" so a session that crosses midnight UTC stays covered. */
export const GENERATED_DAYS = CURRENT_DAY + 4;
export const GENERATED_HOURS = GENERATED_DAYS * HOURS_PER_DAY;

/** Personal-baseline reference window (in-flight, post-adaptation). */
export const BASELINE_FROM_DAY = 8;
export const BASELINE_TO_DAY = 40;

/** Mission hour at which a mission day starts. Day is 1-based. */
export const dayStartHour = (day: number): number => (day - 1) * HOURS_PER_DAY;
export const hourToDay = (hour: number): number => Math.floor(hour / HOURS_PER_DAY) + 1;
export const at = (day: number, hourOfDay: number): number => dayStartHour(day) + hourOfDay;

/** Launch epoch chosen so that "now" falls on CURRENT_DAY, with real UTC time of day. */
function computeLaunchEpoch(nowMs: number): number {
  const d = new Date(nowMs);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - (CURRENT_DAY - 1) * DAY_MS;
}

export const LAUNCH_EPOCH_MS = computeLaunchEpoch(Date.now());

/**
 * Earth–ship distance on an outbound Mars transit, AU.
 * Smooth growth from ~0 to ~1.45 AU at arrival (one-way light time ≈ 12 min).
 */
export function distanceAuOnDay(day: number): number {
  const x = Math.min(1, Math.max(0, day / MISSION_DURATION_DAYS));
  return 0.004 + 1.45 * Math.pow(x, 1.3);
}

export const MISSION_CONFIG: MissionConfig = {
  code: 'NHX-1',
  name: 'Mars Transit',
  vehicle: 'DSV Meridian',
  durationDays: MISSION_DURATION_DAYS,
  launchEpochMs: LAUNCH_EPOCH_MS,
  careerDoseLimitMsv: 600,
  currentDay: CURRENT_DAY,
  team: { flightSurgeon: 'Haleem', flightDirector: 'Hamza' },
  trajectoryAu: Array.from({ length: MISSION_DURATION_DAYS + 1 }, (_, i) => distanceAuOnDay(i + 1)),
};

export const CREW_IDS = ['hashir', 'ahmad', 'hannan', 'sabaina'] as const;
export type CrewId = (typeof CREW_IDS)[number];

/** Timeline events (exercise sessions are generated per crew, not listed here). */
export const MISSION_EVENTS: MissionEvent[] = [
  { id: 'tcm-1', kind: 'burn', label: 'TCM-1 trajectory correction', start: at(12, 14), end: at(12, 15), crewIds: [], hazards: ['distance'] },
  { id: 'eva-1', kind: 'eva', label: 'EVA-1 antenna inspection', start: at(38, 8), end: at(38, 15), crewIds: ['hashir', 'ahmad'], hazards: ['radiation', 'environment'] },
  { id: 'tcm-2', kind: 'burn', label: 'TCM-2 trajectory correction', start: at(60, 10), end: at(60, 11), crewIds: [], hazards: ['distance'] },
  { id: 'eva-2', kind: 'eva', label: 'EVA-2 radiator repair', start: at(91, 8), end: at(91, 15), crewIds: ['ahmad', 'sabaina'], hazards: ['radiation', 'environment'] },
  { id: 'spe-97', kind: 'spe', label: 'Solar particle event, storm shelter', start: at(97, 3), end: at(98, 11), crewIds: [], hazards: ['radiation', 'isolation'] },
  { id: 'oct-126', kind: 'medical', label: 'Ocular ultrasound, routine', start: at(126, 10), end: at(126, 11), crewIds: ['sabaina', 'hashir', 'ahmad', 'hannan'], hazards: ['gravity'] },
  { id: 'shift-136', kind: 'sleep-shift', label: 'Sleep shift −2 h for EVA-3 prep', start: at(136, 21), end: at(145, 6), crewIds: ['ahmad'], hazards: ['isolation', 'environment'] },
  { id: 'cdra-140', kind: 'anomaly', label: 'CO₂ scrubber bed B degraded', start: at(140, 5), end: GENERATED_HOURS, crewIds: [], hazards: ['environment'] },
  { id: 'eva-3', kind: 'eva', label: 'EVA-3 high-gain antenna gimbal', start: at(145, 8), end: at(145, 15), crewIds: ['ahmad', 'hannan'], hazards: ['radiation', 'environment'], planned: true },
];
