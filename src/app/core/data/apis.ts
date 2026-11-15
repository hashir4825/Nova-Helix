import { Observable } from 'rxjs';
import {
  MobilityHistory,
  MobilityMeasurement,
  MobilityMethod,
  MobilitySubmission,
  Severity,
  ActionLogEntry,
  AnswerValue,
  Assignment,
  ChatMessage,
  CheckInDraft,
  Questionnaire,
  QuestionnaireId,
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
 * Bound to core/mock (seeded demo data) or core/http (the backend) in app.config.ts.
 * Each method maps to one endpoint: docs/BACKEND_API_GUIDE.md.
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

/** Astronaut-facing data that IS shared with Mission Control. */
export abstract class CrewModeApi {
  abstract submitCheckIn(crewId: string, draft: CheckInDraft): Observable<CheckIn>;
  abstract questionnaires(): Observable<Record<QuestionnaireId, Questionnaire>>;
  abstract assignments(crewId: string): Observable<Assignment[]>;
  abstract assignment(id: string): Observable<Assignment | undefined>;
  /** Save answers and position so a questionnaire can be resumed. */
  abstract saveProgress(id: string, answers: Record<string, AnswerValue>, currentIndex: number): Observable<Assignment>;
  abstract submitQuestionnaire(id: string, answers: Record<string, AnswerValue>): Observable<Assignment>;
}

/**
 * Nova, the private companion. Conversations stay with the astronaut.
 * Only an explicit share, a confirmed check-in, or the safety exception leaves the chat.
 * The mock is rule-based; a Gemini (prototype) or onboard model can implement this contract.
 */
export abstract class CompanionApi {
  abstract history(crewId: string): Observable<ChatMessage[]>;
  abstract typing(crewId: string): Observable<boolean>;
  abstract start(crewId: string): Observable<void>;
  abstract send(crewId: string, text: string): Observable<void>;
  /** Confirm or dismiss a check-in / share proposal card. */
  abstract resolveCard(crewId: string, messageId: string, action: 'confirm' | 'dismiss', edited?: string): Observable<void>;
  abstract clear(crewId: string): Observable<void>;
}

/** Things the flight surgeon does about a finding. */
export abstract class ActionsApi {
  /** Every logged action (to show "acknowledged" etc. in lists). */
  abstract log(): Observable<ActionLogEntry[]>;
  abstract record(entry: Omit<ActionLogEntry, 'id' | 'at' | 'by'>): Observable<ActionLogEntry>;
  /** Close a finding once handled; it leaves the active views. Reopens itself if it gets more severe. */
  abstract resolve(insightId: string, crewId: string | null, note: string, severity: Severity): Observable<void>;
  abstract reopen(insightId: string, crewId: string | null): Observable<void>;
}

export abstract class AssessmentApi {
  abstract hazards(q: AnalysisQuery): Observable<HazardAssessment[]>;
  abstract insights(q: AnalysisQuery): Observable<Insight[]>;
  abstract crewSummaries(q: AnalysisQuery): Observable<CrewSummary[]>;
  /** AI interpretation of one metric for one astronaut. */
  abstract interpretMetric(q: AnalysisQuery, crewId: string, metric: MetricKey): Observable<MetricInterpretation>;
}

/**
 * Mobility & balance check (Gravity hazard). Pose tracking runs on the device;
 * only the five measured numbers are sent. Shared with Mission Control.
 */
export abstract class MobilityApi {
  /** Tests, thresholds and limits, for the info panel. */
  abstract method(): Observable<MobilityMethod>;
  abstract submit(crewId: string, m: MobilityMeasurement): Observable<MobilitySubmission>;
  /** Check history and the latest scored result. Re-emits on change. */
  abstract history(crewId: string): Observable<MobilityHistory>;
}
