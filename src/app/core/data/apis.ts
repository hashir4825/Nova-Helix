import { Observable } from 'rxjs';
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
} from '../models';

/**
 * Data contracts. Components and stores depend ONLY on these abstract classes.
 * The mock implementations live in core/mock; a real HTTP implementation can be
 * provided instead (see provideMockData in app.config.ts) without touching UI code.
 */

export interface AnalysisQuery {
  /** Mission hour to evaluate at. */
  atHour: number;
  /** Earth link lost: crew operating autonomously. */
  autonomous: boolean;
}

export abstract class MissionApi {
  abstract config(): Observable<MissionConfig>;
  /** All mission timeline events, past and planned. Re-emits on change. */
  abstract events(): Observable<MissionEvent[]>;
  /** Events affecting one astronaut in a window, including their exercise sessions. */
  abstract timeline(crewId: string, from: number, to: number): Observable<MissionEvent[]>;
}

export abstract class CrewApi {
  abstract list(): Observable<Astronaut[]>;
  abstract get(id: string): Observable<Astronaut | undefined>;
}

export abstract class TelemetryApi {
  /**
   * Samples with from <= t <= to (mission hours). Re-emits when data changes.
   * `bucketHours` > 1 returns bucket means (server-side aggregation for long ranges).
   */
  abstract series(crewId: string, metric: MetricKey, from: number, to: number, bucketHours?: number): Observable<Sample[]>;
  abstract baseline(crewId: string, metric: MetricKey): Observable<Baseline | null>;
  /** Live current vitals, emitting every few seconds. */
  abstract live(crewId: string): Observable<LiveVitals>;
  abstract checkIns(crewId: string, from: number, to: number): Observable<CheckIn[]>;
}

export abstract class AssessmentApi {
  abstract hazards(q: AnalysisQuery): Observable<HazardAssessment[]>;
  abstract hazardHistory(q: AnalysisQuery, hazard: HazardKey, crewId: string, fromDay: number): Observable<Sample[]>;
  abstract insights(q: AnalysisQuery): Observable<Insight[]>;
  abstract crewSummaries(q: AnalysisQuery): Observable<CrewSummary[]>;
  /** AI interpretation of one metric for one astronaut. */
  abstract interpretMetric(q: AnalysisQuery, crewId: string, metric: MetricKey): Observable<MetricInterpretation>;
}
