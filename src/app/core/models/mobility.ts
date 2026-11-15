import { Status } from './status';

/*
 * Mobility & balance check: three short movement tests measured in the browser with
 * MediaPipe Pose. Only the five numbers below leave the device; no video.
 * Measures movement (balance, leg strength, knee range), not bone health.
 */

export type MobilityTestKey = 'balance' | 'sit_to_stand' | 'squat_rom';

/** What the astronaut's device sends. */
export interface MobilityMeasurement {
  /** Single-leg hold, 0–30 s. */
  balanceHoldS: number;
  /** RMS hip-centre sway during the hold, % of body height. */
  swayPctHeight: number;
  /** Time for 5 sit-to-stands, s. */
  sitToStand5xS: number;
  /** Deepest knee bend over 3 squats, degrees (0 = straight leg). */
  kneeFlexionDeg: number;
  /** Mean keypoint visibility, 0–1. Below the method's minimum the check is saved but not counted. */
  poseConfidence: number;
}

export interface MobilityTestResult {
  test: MobilityTestKey;
  label: string;
  status: Status;
  /** Measured values by field, e.g. { balance_hold_s: 22 }. */
  values: Record<string, number>;
  /** The astronaut's first reliable check (personal reference), when there is one. */
  baseline: Record<string, number> | null;
  /** % worse than baseline, by field. */
  changePct: Record<string, number>;
  note: string;
}

export interface MobilityAlert {
  what: string;
  why: string;
  action: string;
  source: string;
}

export interface MobilityResult {
  status: Status;
  tests: MobilityTestResult[];
  alert: MobilityAlert | null;
  checksUsed: number;
  lastCheckDay: number;
}

export interface MobilityCheck {
  id: string;
  crewId: string;
  day: number;
  /** Mission hour, when known. */
  at?: number;
  /** False when tracking confidence was too low to use. */
  reliable: boolean;
  measurement?: MobilityMeasurement;
  status?: Status;
}

export interface MobilitySubmission {
  check: MobilityCheck;
  /** False when tracking was too poor; `result` is then null and the astronaut should retake. */
  counted: boolean;
  message: string;
  result: MobilityResult | null;
}

export interface MobilityHistory {
  crewId: string;
  checks: MobilityCheck[];
  latest: MobilityResult | null;
}

export interface MobilityMethod {
  title: string;
  tests: { test: MobilityTestKey; label: string; durationS: number; instructions: string }[];
  minPoseConfidence: number;
  thresholds: {
    balanceHoldWatchS: number;
    balanceHoldAlertS: number;
    sitToStandWatchS: number;
    sitToStandAlertS: number;
    kneeFlexionWatchDeg: number;
    kneeFlexionAlertDeg: number;
    /** Fraction worse than the first check that raises watch / alert. */
    worseThanFirstWatch: number;
    worseThanFirstAlert: number;
  };
  limits: string;
}
