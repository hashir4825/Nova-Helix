import { HazardKey } from './hazard';

export type MissionEventKind = 'eva' | 'spe' | 'exercise' | 'sleep-shift' | 'burn' | 'medical' | 'anomaly';

export interface MissionEvent {
  id: string;
  kind: MissionEventKind;
  label: string;
  /** Mission hour the event starts. */
  start: number;
  /** Mission hour the event ends. */
  end: number;
  /** Affected crew; empty = whole crew. */
  crewIds: string[];
  hazards: HazardKey[];
  /** Scheduled in the future relative to "now". */
  planned?: boolean;
}

export interface MissionConfig {
  code: string;
  name: string;
  vehicle: string;
  durationDays: number;
  /** Epoch ms of mission hour 0 (launch, Day 1 00:00 UTC). */
  launchEpochMs: number;
  careerDoseLimitMsv: number;
  /** Day the "live" mission currently is on. */
  currentDay: number;
  /** Earth–ship distance per mission day (index 0 = Day 1), AU. */
  trajectoryAu: number[];
  /** Mission Control team. */
  team: { flightSurgeon: string; flightDirector: string };
}

export type LinkMode = 'nominal' | 'degraded' | 'autonomous';

export interface LinkState {
  mode: LinkMode;
  /** One-way light time in seconds. */
  delaySeconds: number;
  distanceAu: number;
}
