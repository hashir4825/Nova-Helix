import { MobilityAlert, MobilityCheck, MobilityMeasurement, MobilityMethod, MobilityResult, MobilityTestResult, Status, worstStatus } from '../models';

/*
 * Scoring for the mobility & balance check, mirroring the backend rule G.mobility
 * (GET /api/mobility/method). Thresholds are illustrative, not clinical.
 * Each test: the worse of an absolute cut-off and the change since the astronaut's
 * first reliable check (their personal reference).
 */

export const MOBILITY_METHOD: MobilityMethod = {
  title: 'Mobility & Balance Check',
  tests: [
    { test: 'balance', label: 'Single-leg balance', durationS: 30, instructions: 'Stand on one leg, hands on hips, eyes open. Hold up to 30 seconds.' },
    { test: 'sit_to_stand', label: '5× sit-to-stand', durationS: 30, instructions: 'Arms crossed, stand up fully and sit down 5 times as fast as is safe.' },
    { test: 'squat_rom', label: 'Squat knee bend', durationS: 20, instructions: 'Side-on to the camera, do 3 slow bodyweight squats as deep as is comfortable.' },
  ],
  minPoseConfidence: 0.6,
  thresholds: {
    balanceHoldWatchS: 10,
    balanceHoldAlertS: 5,
    sitToStandWatchS: 12,
    sitToStandAlertS: 15,
    kneeFlexionWatchDeg: 100,
    kneeFlexionAlertDeg: 80,
    worseThanFirstWatch: 0.25,
    worseThanFirstAlert: 0.5,
  },
  limits:
    'Measures movement (balance, leg strength, knee range of motion) from body keypoints. It cannot assess bone health or bone loss, which needs a bone density scan. Video stays on the device; only these numbers are sent.',
};

/** Same ranges the API enforces (422 outside them). */
export function validateMobility(m: MobilityMeasurement): string | null {
  const bad = (v: number, lo: number, hi: number, loOpen = false) => !Number.isFinite(v) || (loOpen ? v <= lo : v < lo) || v > hi;
  if (bad(m.balanceHoldS, 0, 30)) return 'Balance hold must be 0–30 s';
  if (bad(m.swayPctHeight, 0, 50)) return 'Sway must be 0–50% of body height';
  if (bad(m.sitToStand5xS, 1, 120, true)) return 'Sit-to-stand time must be above 1 s and at most 120 s';
  if (bad(m.kneeFlexionDeg, 0, 150)) return 'Knee bend must be 0–150° (higher is a tracking error)';
  if (bad(m.poseConfidence, 0, 1)) return 'Tracking confidence must be 0–1';
  return null;
}

const T = MOBILITY_METHOD.thresholds;

function changeStatus(worse: number): Status {
  return worse >= T.worseThanFirstAlert ? 'alert' : worse >= T.worseThanFirstWatch ? 'watch' : 'nominal';
}

const pct = (x: number) => Math.round(x * 1000) / 10;

/** Fractional change in the "worse" direction (positive = worse). */
function worseBy(value: number, base: number | undefined, higherIsWorse: boolean): number | null {
  if (base === undefined || !base) return null;
  return higherIsWorse ? (value - base) / base : (base - value) / base;
}

export function scoreMobility(m: MobilityMeasurement, first: MobilityMeasurement | null, checksUsed: number, day: number): MobilityResult {
  const tests: MobilityTestResult[] = [];

  // Balance: hold time (absolute + change); sway reported only.
  {
    const abs: Status = m.balanceHoldS < T.balanceHoldAlertS ? 'alert' : m.balanceHoldS < T.balanceHoldWatchS ? 'watch' : 'nominal';
    const dHold = worseBy(m.balanceHoldS, first?.balanceHoldS, false);
    const dSway = worseBy(m.swayPctHeight, first?.swayPctHeight, true);
    // Sway is reported but not scored: the method defines no sway threshold, and small values swing a lot.
    const status = worstStatus(abs, changeStatus(dHold ?? 0));
    tests.push({
      test: 'balance',
      label: 'Single-leg balance',
      status,
      values: { balance_hold_s: m.balanceHoldS, sway_pct_height: m.swayPctHeight },
      baseline: first ? { balance_hold_s: first.balanceHoldS, sway_pct_height: first.swayPctHeight } : null,
      changePct: { ...(dHold !== null ? { balance_hold_s: pct(dHold) } : {}), ...(dSway !== null ? { sway_pct_height: pct(dSway) } : {}) },
      note:
        abs !== 'nominal'
          ? `Held ${m.balanceHoldS.toFixed(1)} s, under the ${abs === 'alert' ? T.balanceHoldAlertS : T.balanceHoldWatchS} s guide.`
          : status !== 'nominal'
            ? 'Balance is worse than the first check.'
            : `Held ${m.balanceHoldS.toFixed(1)} s with steady hips.`,
    });
  }

  // Sit-to-stand: lower is better.
  {
    const abs: Status = m.sitToStand5xS > T.sitToStandAlertS ? 'alert' : m.sitToStand5xS > T.sitToStandWatchS ? 'watch' : 'nominal';
    const d = worseBy(m.sitToStand5xS, first?.sitToStand5xS, true);
    const status = worstStatus(abs, changeStatus(d ?? 0));
    tests.push({
      test: 'sit_to_stand',
      label: '5× sit-to-stand',
      status,
      values: { sit_to_stand_5x_s: m.sitToStand5xS },
      baseline: first ? { sit_to_stand_5x_s: first.sitToStand5xS } : null,
      changePct: d !== null ? { sit_to_stand_5x_s: pct(d) } : {},
      note:
        abs !== 'nominal'
          ? `${m.sitToStand5xS.toFixed(1)} s, slower than the ${abs === 'alert' ? T.sitToStandAlertS : T.sitToStandWatchS} s guide: leg strength may be dropping.`
          : status !== 'nominal'
            ? 'Slower than the first check.'
            : `${m.sitToStand5xS.toFixed(1)} s for 5 stand-ups.`,
    });
  }

  // Squat knee bend: higher is better.
  {
    const abs: Status = m.kneeFlexionDeg < T.kneeFlexionAlertDeg ? 'alert' : m.kneeFlexionDeg < T.kneeFlexionWatchDeg ? 'watch' : 'nominal';
    const d = worseBy(m.kneeFlexionDeg, first?.kneeFlexionDeg, false);
    const status = worstStatus(abs, changeStatus(d ?? 0));
    tests.push({
      test: 'squat_rom',
      label: 'Squat knee bend',
      status,
      values: { knee_flexion_deg: m.kneeFlexionDeg },
      baseline: first ? { knee_flexion_deg: first.kneeFlexionDeg } : null,
      changePct: d !== null ? { knee_flexion_deg: pct(d) } : {},
      note:
        abs !== 'nominal'
          ? `Deepest bend ${m.kneeFlexionDeg.toFixed(0)}°, under the ${abs === 'alert' ? T.kneeFlexionAlertDeg : T.kneeFlexionWatchDeg}° guide.`
          : status !== 'nominal'
            ? 'Less knee bend than the first check.'
            : `Deepest bend ${m.kneeFlexionDeg.toFixed(0)}°.`,
    });
  }

  const status = worstStatus(...tests.map((t) => t.status));
  const flagged = tests.filter((t) => t.status !== 'nominal').map((t) => t.label.toLowerCase());
  const alert: MobilityAlert =
    status === 'nominal'
      ? {
          what: first ? 'All three movement tests are within the usual range.' : 'First check saved. Later checks are compared with this one.',
          why: 'Microgravity weakens leg muscles and balance; regular checks catch a decline early.',
          action: 'No action needed. Repeat the check next week.',
          source: 'Pose keypoints measured on the device; thresholds are illustrative, not clinical.',
        }
      : {
          what: `Movement check flagged: ${flagged.join(', ')}.`,
          why: 'Reduced balance or leg strength raises fall and injury risk on arrival, when gravity returns.',
          action: 'Review the resistive exercise plan and repeat the check within 3 days.',
          source: 'Pose keypoints measured on the device; thresholds are illustrative, not clinical.',
        };

  return { status, tests, alert, checksUsed, lastCheckDay: day };
}

/** Latest reliable check up to `hour`, scored against the first reliable check. */
export function mobilityAt(checks: MobilityCheck[], hour: number): MobilityResult | null {
  const usable = checks.filter((c) => c.reliable && c.measurement && (c.at ?? -Infinity) <= hour).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const last = usable.at(-1);
  if (!last?.measurement) return null;
  const first = usable.length > 1 ? (usable[0].measurement ?? null) : null;
  return scoreMobility(last.measurement, first, usable.length, last.day);
}
