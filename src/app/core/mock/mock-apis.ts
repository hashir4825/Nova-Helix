import { Injectable, Provider, inject } from '@angular/core';
import { BehaviorSubject, Observable, delayWhen, distinctUntilChanged, map, of, timer } from 'rxjs';
import { AnalysisQuery, AssessmentApi, CrewApi, MissionApi, TelemetryApi } from '../data/apis';
import {
  Astronaut,
  Baseline,
  CheckIn,
  CrewSummary,
  HazardAssessment,
  HazardKey,
  Insight,
  LiveVitals,
  MetricInterpretation,
  MetricKey,
  MissionConfig,
  MissionEvent,
  Sample,
  VITAL_KEYS,
  severityToStatus,
  worstStatus,
} from '../models';
import { EngineContext } from './engine/context';
import { assessHazards, hazardHistory } from './engine/hazards';
import { detectInsights } from './engine/insights';
import { HOUR_MS, MISSION_CONFIG, hourToDay } from './mission-plan';
import { MockDatabase } from './mock-database';
import { downsample, lowerBound, sliceSamples } from './stats';
import { interpretMetric } from './engine/interpret';
import { linkStateAt } from '../util/link';

/** Simulated network latency on the first emission only (lets loading states show). */
function latency<T>(ms = 280) {
  return (source: Observable<T>) => source.pipe(delayWhen((_, i) => (i === 0 ? timer(ms + Math.random() * 180) : of(0))));
}


@Injectable({ providedIn: 'root' })
export class MockDb extends MockDatabase {
  readonly changes$ = new BehaviorSubject<number>(0);

  override addCheckIn(c: CheckIn): void {
    super.addCheckIn(c);
    this.changes$.next(this.version);
  }

  override addEvent(e: MissionEvent): void {
    super.addEvent(e);
    this.changes$.next(this.version);
  }
}

@Injectable({ providedIn: 'root' })
export class MockMissionApi extends MissionApi {
  private readonly db = inject(MockDb);
  config(): Observable<MissionConfig> {
    return of(MISSION_CONFIG);
  }
  events(): Observable<MissionEvent[]> {
    return this.db.changes$.pipe(map(() => this.db.events()));
  }
  timeline(crewId: string, from: number, to: number): Observable<MissionEvent[]> {
    return this.db.changes$.pipe(
      map(() => {
        const events = this.db
          .events()
          .filter((e) => e.end >= from && e.start <= to && (e.crewIds.length === 0 || e.crewIds.includes(crewId)));
        const exercise: MissionEvent[] = this.db
          .exercise(crewId)
          .filter((s) => s.end >= from && s.start <= to)
          .map((s) => ({
            id: `ex-${crewId}-${s.day}`,
            kind: 'exercise',
            label: s.done ? 'Exercise' : 'Exercise missed',
            missed: !s.done,
            start: s.start,
            end: s.end,
            crewIds: [crewId],
            hazards: ['gravity'],
          }));
        return [...events, ...exercise].sort((a, b) => a.start - b.start);
      }),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class MockCrewApi extends CrewApi {
  private readonly db = inject(MockDb);
  list(): Observable<Astronaut[]> {
    return of(this.db.crew()).pipe(latency(200));
  }
  get(id: string): Observable<Astronaut | undefined> {
    return of(this.db.astronaut(id)).pipe(latency(150));
  }
}

const LIVE_JITTER: Partial<Record<MetricKey, number>> = {
  hr: 1.2, hrv: 2.2, spo2: 0.25, coreTemp: 0.02, bpSys: 1.4, bpDia: 1, resp: 0.4,
};

@Injectable({ providedIn: 'root' })
export class MockTelemetryApi extends TelemetryApi {
  private readonly db = inject(MockDb);

  series(crewId: string, metric: MetricKey, from: number, to: number, bucketHours = 1): Observable<Sample[]> {
    return this.db.changes$.pipe(
      map(() => downsample(sliceSamples(this.db.series(crewId, metric), from, to), bucketHours)),
      latency(),
    );
  }

  baseline(crewId: string, metric: MetricKey): Observable<Baseline | null> {
    return of(this.db.baseline(crewId, metric));
  }

  live(crewId: string): Observable<LiveVitals> {
    return timer(0, 3000).pipe(
      map(() => {
        const t = (Date.now() - MISSION_CONFIG.launchEpochMs) / HOUR_MS;
        const values: Partial<Record<MetricKey, number>> = {};
        for (const k of VITAL_KEYS) {
          const s = this.db.series(crewId, k);
          const i = Math.min(s.length - 2, Math.max(0, lowerBound(s, t) - 1));
          const a = s[i];
          const b = s[i + 1];
          const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
          const jitter = (Math.random() - 0.5) * 2 * (LIVE_JITTER[k] ?? 0);
          values[k] = a.v + (b.v - a.v) * f + jitter;
        }
        if (values.spo2 !== undefined) values.spo2 = Math.min(100, values.spo2);
        return { crewId, t, values };
      }),
    );
  }

  checkIns(crewId: string, from: number, to: number): Observable<CheckIn[]> {
    return this.db.changes$.pipe(
      map(() => this.db.checkIns(crewId).filter((c) => c.at >= from && c.at <= to)),
      latency(),
    );
  }
}

interface Analysis {
  hazards: HazardAssessment[];
  insights: Insight[];
}

@Injectable({ providedIn: 'root' })
export class MockAssessmentApi extends AssessmentApi {
  private readonly db = inject(MockDb);
  private readonly cache = new Map<string, Analysis>();

  private ctx(q: AnalysisQuery): EngineContext {
    return {
      db: this.db,
      hour: q.atHour,
      link: linkStateAt(MISSION_CONFIG, q.atHour, q.autonomous),
      careerLimitMsv: MISSION_CONFIG.careerDoseLimitMsv,
    };
  }

  private analyze(q: AnalysisQuery): Analysis {
    const key = `${Math.floor(q.atHour * 4) / 4}:${this.db.version}:${q.autonomous}`;
    let a = this.cache.get(key);
    if (!a) {
      const ctx = this.ctx(q);
      a = { hazards: assessHazards(ctx), insights: detectInsights(ctx) };
      if (this.cache.size > 400) this.cache.clear();
      this.cache.set(key, a);
    }
    return a;
  }

  private stream<T>(q: AnalysisQuery, pick: (a: Analysis) => T): Observable<T> {
    return this.db.changes$.pipe(
      map(() => pick(this.analyze(q))),
      distinctUntilChanged(),
      latency(),
    );
  }

  hazards(q: AnalysisQuery): Observable<HazardAssessment[]> {
    return this.stream(q, (a) => a.hazards);
  }

  insights(q: AnalysisQuery): Observable<Insight[]> {
    return this.stream(q, (a) => a.insights);
  }

  hazardHistory(q: AnalysisQuery, hazard: HazardKey, crewId: string, fromDay: number): Observable<Sample[]> {
    return this.db.changes$.pipe(
      map(() => hazardHistory(this.ctx(q), hazard, crewId, fromDay, hourToDay(q.atHour))),
      latency(),
    );
  }

  crewSummaries(q: AnalysisQuery): Observable<CrewSummary[]> {
    return this.stream(q, (a) => {
      const today = hourToDay(q.atHour);
      return this.db.crew().map((astro) => {
        const hz = a.hazards.filter((h) => h.crewId === astro.id).map((h) => h.status);
        const ins = a.insights.filter((i) => i.crewId === astro.id).map((i) => severityToStatus(i.severity));
        const ci = this.db.checkIns(astro.id).find((c) => c.day === today && c.at <= q.atHour);
        const next = this.db
          .events()
          .filter((e) => e.start > q.atHour && (e.crewIds.length === 0 || e.crewIds.includes(astro.id)))
          .sort((x, y) => x.start - y.start)[0];
        return {
          crewId: astro.id,
          status: worstStatus(...hz, ...ins),
          checkInHour: ci?.at ?? null,
          nextEvent: next ? { label: next.label.split(' ')[0], day: hourToDay(next.start) } : null,
        };
      });
    });
  }

  interpretMetric(q: AnalysisQuery, crewId: string, metric: MetricKey): Observable<MetricInterpretation> {
    return this.db.changes$.pipe(
      map(() => interpretMetric(this.ctx(q), crewId, metric)),
      latency(420),
    );
  }
}

/** Swap this for provideHttpData() when the real backend exists. */
export function provideMockData(): Provider[] {
  return [
    { provide: MissionApi, useExisting: MockMissionApi },
    { provide: CrewApi, useExisting: MockCrewApi },
    { provide: TelemetryApi, useExisting: MockTelemetryApi },
    { provide: AssessmentApi, useExisting: MockAssessmentApi },
  ];
}
