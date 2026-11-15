import {
  Resolution,
  ActionLogEntry,
  Assignment,
  Astronaut,
  Baseline,
  ChatMessage,
  CheckIn,
  METRICS,
  MetricKey,
  MissionEvent,
  SafetyFlag,
  Sample,
  SharedNote,
  MobilityCheck,
} from '../models';
import { CrewBundle, ExerciseSession, generateCrew } from './generator';
import { BASELINE_FROM_DAY, BASELINE_TO_DAY, CREW_IDS, CrewId, MISSION_CONFIG, MISSION_EVENTS, at } from './mission-plan';
import { seedAssignments } from './questionnaires';
import { PERSONAS } from './personas';
import { mean, percentile, sd, sliceSamples } from './stats';

const CHECKIN_METRICS: ReadonlySet<MetricKey> = new Set(['mood', 'energy', 'sleepQuality']);

/** Minimum half-band per metric so baselines never collapse to a line. */
const MIN_HALF_BAND: Partial<Record<MetricKey, number>> = {
  sleepDuration: 0.5,
  sleepEfficiency: 3,
  mood: 0.45,
  energy: 0.45,
  sleepQuality: 0.45,
  stress: 8,
  workload: 8,
  co2: 0.3,
  reactionTime: 18,
  visionAcuity: 0.08,
  wbc: 0.9,
  lymphocytes: 0.3,
  boneMarker: 7,
  doseRate: 12,
};

/**
 * In-memory "backend" for the mock layer. Plain class (no Angular) so the
 * generator and engines can be exercised from scripts and tests.
 */
export class MockDatabase {
  private readonly bundles = new Map<string, CrewBundle>();
  private readonly baselineCache = new Map<string, Baseline | null>();
  private readonly submitted = new Map<string, CheckIn[]>();
  private readonly derivedCache = new Map<string, Sample[]>();
  private readonly extraEvents: MissionEvent[] = [];
  private _version = 0;

  get version(): number {
    return this._version;
  }

  crew(): Astronaut[] {
    return CREW_IDS.map((id) => PERSONAS[id].astronaut);
  }

  astronaut(id: string): Astronaut | undefined {
    return (PERSONAS as Record<string, (typeof PERSONAS)[CrewId] | undefined>)[id]?.astronaut;
  }

  bundle(crewId: string): CrewBundle {
    let b = this.bundles.get(crewId);
    if (!b) {
      b = generateCrew(crewId as CrewId);
      this.bundles.set(crewId, b);
    }
    return b;
  }

  /** Full series (all generated hours). Callers slice to "now". */
  series(crewId: string, metric: MetricKey): Sample[] {
    if (CHECKIN_METRICS.has(metric)) {
      const key = `${crewId}:${metric}:${this._version}`;
      let s = this.derivedCache.get(key);
      if (!s) {
        const field = metric as 'mood' | 'energy' | 'sleepQuality';
        s = this.checkIns(crewId).map((c) => ({ t: c.at, v: c[field] }));
        this.derivedCache.set(key, s);
      }
      return s;
    }
    return this.bundle(crewId).series.get(metric) ?? [];
  }

  checkIns(crewId: string): CheckIn[] {
    const generated = this.bundle(crewId).checkIns;
    const extra = this.submitted.get(crewId) ?? [];
    if (!extra.length) return generated;
    const replacedDays = new Set(extra.map((c) => c.day));
    return [...generated.filter((c) => !replacedDays.has(c.day)), ...extra].sort((a, b) => a.at - b.at);
  }

  addCheckIn(checkIn: CheckIn): void {
    const list = this.submitted.get(checkIn.crewId) ?? [];
    this.submitted.set(checkIn.crewId, [...list.filter((c) => c.day !== checkIn.day), checkIn]);
    this.bump();
  }

  exercise(crewId: string): ExerciseSession[] {
    return this.bundle(crewId).exercise;
  }

  events(): MissionEvent[] {
    return [...MISSION_EVENTS, ...this.extraEvents];
  }

  addEvent(e: MissionEvent): void {
    this.extraEvents.push(e);
    this.bump();
  }

  // ── Crew mode: questionnaires, Nova, sharing ─────────────────────
  private assignmentList: Assignment[] = seedAssignments(MISSION_CONFIG.team.flightSurgeon);
  private readonly safety: SafetyFlag[] = [];
  private readonly notes: SharedNote[] = [];
  private readonly chats = new Map<string, ChatMessage[]>();

  assignments(crewId?: string): Assignment[] {
    return crewId ? this.assignmentList.filter((a) => a.crewId === crewId) : this.assignmentList;
  }

  updateAssignment(a: Assignment): void {
    this.assignmentList = this.assignmentList.map((x) => (x.id === a.id ? a : x));
    this.bump();
  }

  /** Insert a new measurement in time order (e.g. a questionnaire score). */
  addSample(crewId: string, metric: MetricKey, sample: Sample): void {
    const series = this.bundle(crewId).series;
    const arr = [...(series.get(metric) ?? []), sample].sort((a, b) => a.t - b.t);
    series.set(metric, arr);
    this.bump();
  }

  safetyFlags(): SafetyFlag[] {
    return this.safety;
  }

  addSafetyFlag(f: SafetyFlag): void {
    this.safety.push(f);
    this.bump();
  }

  sharedNotes(): SharedNote[] {
    return this.notes;
  }

  addSharedNote(n: SharedNote): void {
    this.notes.push(n);
    this.bump();
  }

  // ── Mission Control actions ──────────────────────────────────────
  private readonly log: ActionLogEntry[] = [];

  actionLog(insightId?: string): ActionLogEntry[] {
    return insightId ? this.log.filter((e) => e.insightId === insightId) : this.log;
  }

  addLog(e: ActionLogEntry): void {
    this.log.push(e);
    this.bump();
  }

  private readonly resolutions = new Map<string, Resolution>();

  resolution(insightId: string): Resolution | undefined {
    return this.resolutions.get(insightId);
  }

  resolve(insightId: string, r: Resolution): void {
    this.resolutions.set(insightId, r);
    this.bump();
  }

  reopen(insightId: string): void {
    this.resolutions.delete(insightId);
    this.bump();
  }

  // ── Mobility & balance checks (numbers only; no video) ───────────
  private readonly mobility: MobilityCheck[] = [];

  mobilityChecks(crewId: string): MobilityCheck[] {
    return this.mobility.filter((c) => c.crewId === crewId);
  }

  addMobilityCheck(c: MobilityCheck): void {
    this.mobility.push(c);
    this.bump();
  }


  /** Private Nova conversation. Never read by the analysis engine. */
  chat(crewId: string): ChatMessage[] {
    return this.chats.get(crewId) ?? [];
  }

  setChat(crewId: string, messages: ChatMessage[]): void {
    this.chats.set(crewId, messages);
    this.onChatChange(crewId);
  }

  /** Hook for chat updates (kept separate so private chat never triggers re-analysis). */
  protected onChatChange(_crewId: string): void {
    /* overridden by the Angular wrapper */
  }

  /** Is the astronaut doing scheduled exercise or EVA at this hour (for baseline exclusion)? */
  isActive(crewId: string, hour: number): boolean {
    const b = this.bundle(crewId);
    const h = Math.floor(hour);
    return (b.exerciseLoad[h] ?? 0) > 0 || (b.eva[h] ?? 0) > 0;
  }

  /** Personal baseline from the astronaut's own data. Null where a band is not meaningful. */
  baseline(crewId: string, metric: MetricKey): Baseline | null {
    const key = `${crewId}:${metric}`;
    if (this.baselineCache.has(key)) return this.baselineCache.get(key) ?? null;
    const result = this.computeBaseline(crewId, metric);
    this.baselineCache.set(key, result);
    return result;
  }

  private computeBaseline(crewId: string, metric: MetricKey): Baseline | null {
    const def = METRICS[metric];
    const all = this.series(crewId, metric);
    if (metric === 'radDose' || metric === 'medKit') return null;
    if (def.cadence === 'monthly') {
      const vals = sliceSamples(all, at(1, 0), at(60, 23.99)).map((s) => s.v);
      const m = mean(vals);
      const half = Math.max(1.4 * sd(vals), MIN_HALF_BAND[metric] ?? 0);
      return { mean: m, low: m - half, high: m + half, source: 'Early-mission labs D15–D45' };
    }
    if (metric === 'boneDensity' || metric === 'muscleMass' || metric === 'legStrength') {
      const pre = all[0]?.v;
      if (pre === undefined) return null;
      const tol = metric === 'legStrength' ? 0.03 : 0.015;
      return { mean: pre, low: pre * (1 - tol), high: pre * (1 + tol), source: 'Preflight / first measurement' };
    }
    const from = at(BASELINE_FROM_DAY, 0);
    const to = at(BASELINE_TO_DAY, 23.99);
    let samples = sliceSamples(all, from, to);
    if (def.cadence === 'hourly') {
      samples = samples.filter((s) => !this.isActive(crewId, s.t));
      const vals = samples.map((s) => s.v);
      return {
        mean: mean(vals),
        low: percentile(vals, 0.05),
        high: percentile(vals, 0.95),
        source: `In-flight D${BASELINE_FROM_DAY}–D${BASELINE_TO_DAY}, resting`,
      };
    }
    if (def.cadence === 'weekly') samples = sliceSamples(all, at(7, 0), at(42, 23.99));
    const vals = samples.map((s) => s.v);
    const m = mean(vals);
    const half = Math.max(1.4 * sd(vals), MIN_HALF_BAND[metric] ?? 0);
    return {
      mean: m,
      low: m - half,
      high: m + half,
      source: def.cadence === 'weekly' ? 'In-flight D7–D42' : `In-flight D${BASELINE_FROM_DAY}–D${BASELINE_TO_DAY}`,
    };
  }

  /** Any shared data changed: re-run analysis. */
  protected bump(): void {
    this._version++;
    this.onChange();
  }

  protected onChange(): void {
    /* overridden by the Angular wrapper */
  }
}
