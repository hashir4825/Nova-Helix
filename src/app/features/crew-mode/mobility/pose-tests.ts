/*
 * Movement tests measured from MediaPipe Pose keypoints, frame by frame.
 * Ported from the backend's reference page (/demo/mobility/) so the numbers match.
 * Pure functions: no Angular, no DOM.
 */

/** A keypoint in video pixels with its visibility. */
export interface Pt {
  x: number;
  y: number;
  v: number;
}

export interface FrameInfo {
  /** Knee flexion of the better-tracked leg (0 = straight), or null if not trustworthy this frame. */
  flex: number | null;
  /** Mean visibility of hips, knees and ankles, 0–1. */
  conf: number;
  /** Nose to mid-ankle distance, px. */
  bodyH: number;
  hip: { x: number; y: number };
  /** Vertical gap between the ankles, px (a lifted foot). */
  ankleGap: number;
}

/** A 2D knee angle beyond this is a tracking error (the API rejects it too). */
export const MAX_HUMAN_FLEXION = 150;
/** A joint below this visibility is ignored for that frame. */
const MIN_VIS = 0.5;

/** MediaPipe Pose landmark indices. */
export const LM = { nose: 0, lSh: 11, rSh: 12, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnk: 27, rAnk: 28 } as const;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
export const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Angle at b, degrees. */
function angle(a: Pt, b: Pt, c: Pt): number {
  const v1 = [a.x - b.x, a.y - b.y];
  const v2 = [c.x - b.x, c.y - b.y];
  const n = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]);
  return n ? (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n))) * 180) / Math.PI : 180;
}

/** `lms` are normalised landmarks (0–1); w/h are the video size. */
export function frameInfo(lms: { x: number; y: number; visibility?: number }[], w: number, h: number): FrameInfo {
  const px = (i: number): Pt => ({ x: lms[i].x * w, y: lms[i].y * h, v: lms[i].visibility ?? 0 });
  const P = {
    nose: px(LM.nose),
    lHip: px(LM.lHip),
    rHip: px(LM.rHip),
    lKnee: px(LM.lKnee),
    rKnee: px(LM.rKnee),
    lAnk: px(LM.lAnk),
    rAnk: px(LM.rAnk),
  };
  const sides = [
    [P.lHip, P.lKnee, P.lAnk],
    [P.rHip, P.rKnee, P.rAnk],
  ].map(([hp, k, a]) => ({ v: Math.min(hp.v, k.v, a.v), flex: 180 - angle(hp, k, a) }));
  const best = sides[0].v >= sides[1].v ? sides[0] : sides[1];
  const midAnkle = { x: (P.lAnk.x + P.rAnk.x) / 2, y: (P.lAnk.y + P.rAnk.y) / 2 };
  return {
    flex: best.v >= MIN_VIS && best.flex <= MAX_HUMAN_FLEXION ? best.flex : null,
    conf: mean([P.lHip.v, P.rHip.v, P.lKnee.v, P.rKnee.v, P.lAnk.v, P.rAnk.v]),
    bodyH: dist(P.nose, midAnkle),
    hip: { x: (P.lHip.x + P.rHip.x) / 2, y: (P.lHip.y + P.rHip.y) / 2 },
    ankleGap: Math.abs(P.lAnk.y - P.rAnk.y),
  };
}

export type TestKey = 'balance' | 'sit_to_stand' | 'squat_rom';

export interface TestValues {
  balance_hold_s?: number;
  sway_pct_height?: number;
  sit_to_stand_5x_s?: number;
  knee_flexion_deg?: number;
}

export interface StepOut {
  /** What to show the astronaut right now. */
  banner: string;
  /** Live progress, e.g. "2 / 5". */
  progress?: string;
  done?: boolean;
  /** Null when the test ended without a measurement (timeout, no lift). */
  values?: TestValues | null;
  /** Mean tracking confidence over the test. */
  conf?: number;
}

/** Called once per frame with seconds since the test began. */
export type TestStep = (info: FrameInfo, t: number) => StepOut;

const finish = (banner: string, values: TestValues | null, conf = 0): StepOut => ({ banner, done: true, values, conf });

function balanceTest(): TestStep {
  let phase: 'wait' | 'hold' = 'wait';
  let liftT: number | null = null;
  let holdStart = 0;
  let lostT: number | null = null;
  const bodyHs: number[] = [];
  const hips: { x: number; y: number }[] = [];
  const confs: number[] = [];
  return (info, t) => {
    if (info.bodyH) bodyHs.push(info.bodyH);
    const bodyH = median(bodyHs.slice(0, 30));
    const lifted = info.ankleGap > 0.08 * bodyH;
    confs.push(info.conf);
    if (phase === 'wait') {
      if (t > 12) return finish('No foot lift detected. Try again.', null);
      liftT = lifted ? (liftT ?? t) : null;
      if (liftT !== null && t - liftT > 0.3) {
        phase = 'hold';
        holdStart = liftT;
      }
      return { banner: 'Lift one foot and balance on the other leg' };
    }
    hips.push(info.hip);
    lostT = lifted ? null : (lostT ?? t);
    const stopped = lostT !== null && t - lostT > 0.5;
    const hold = Math.min(30, (stopped && lostT !== null ? lostT : t) - holdStart);
    if (stopped || hold >= 30) {
      const mx = mean(hips.map((h) => h.x));
      const my = mean(hips.map((h) => h.y));
      const rms = Math.sqrt(mean(hips.map((h) => (h.x - mx) ** 2 + (h.y - my) ** 2)));
      return finish(`Held ${hold.toFixed(1)} s`, { balance_hold_s: round(hold, 1), sway_pct_height: round((100 * rms) / bodyH, 2) }, mean(confs));
    }
    return { banner: 'Hold steady', progress: `${hold.toFixed(1)} s` };
  };
}

function sitToStandTest(): TestStep {
  let phase: 'seated' | 'standing' | null = null;
  let reps = 0;
  let startT: number | null = null;
  const confs: number[] = [];
  return (info, t) => {
    if (info.flex === null) return { banner: 'Keep your whole body in view' };
    confs.push(info.conf);
    if (phase === null) {
      if (info.flex < 55) return { banner: 'Sit down on the chair first' };
      phase = 'seated';
    }
    if (t > 60) return finish('Timed out. Try again.', null);
    if (phase === 'seated') {
      if (info.flex < 45 && startT === null) startT = t;
      if (info.flex < 25) {
        reps++;
        phase = 'standing';
      }
    } else if (info.flex > 55) phase = 'seated';
    if (reps >= 5 && startT !== null) return finish(`5 stand-ups in ${(t - startT).toFixed(1)} s`, { sit_to_stand_5x_s: round(t - startT, 1) }, mean(confs));
    return { banner: 'Stand up fully, sit down, repeat', progress: `${reps} / 5` };
  };
}

function squatTest(): TestStep {
  let phase: 'up' | 'down' = 'up';
  let peak = 0;
  const peaks: number[] = [];
  const confs: number[] = [];
  return (info, t) => {
    if (info.flex === null) return { banner: 'Keep your whole body in view' };
    confs.push(info.conf);
    if (t > 40) return finish('Timed out. Try again.', null);
    if (phase === 'up' && info.flex > 50) {
      phase = 'down';
      peak = info.flex;
    } else if (phase === 'down') {
      peak = Math.max(peak, info.flex);
      if (info.flex < 25) {
        peaks.push(peak);
        phase = 'up';
      }
    }
    if (peaks.length >= 3) {
      const deg = median(peaks);
      return finish(`Deepest knee bend ${deg.toFixed(0)}°`, { knee_flexion_deg: round(deg, 1) }, mean(confs));
    }
    return { banner: 'Squat slowly, as deep as is comfortable', progress: `${peaks.length} / 3` };
  };
}

export const TESTS: Record<TestKey, () => TestStep> = {
  balance: balanceTest,
  sit_to_stand: sitToStandTest,
  squat_rom: squatTest,
};
