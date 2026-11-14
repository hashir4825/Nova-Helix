import { HazardKey } from './hazard';
import { MetricKey } from './metric';
import { Severity, Status } from './status';

export type ActionKind =
  | 'acknowledge'
  | 'message'
  | 'questionnaire'
  | 'countermeasure'
  | 'escalate';

export type CountermeasureKind = 'exercise' | 'sleep-shift' | 'rest' | 'storm-shelter';

export interface Evidence {
  label: string;
  /** Formatted current value, e.g. "5.4 h". */
  value: string;
  /** Formatted personal baseline or reference, e.g. "6.9 h". */
  reference?: string;
  metric?: MetricKey;
  crewId?: string;
  direction?: 'up' | 'down' | 'flat';
}

export interface RecommendedAction {
  kind: ActionKind;
  label: string;
  detail: string;
  countermeasure?: CountermeasureKind;
  questionnaireId?: string;
}

export interface Insight {
  id: string;
  /** Null = crew-wide. */
  crewId: string | null;
  severity: Severity;
  hazards: HazardKey[];
  title: string;
  summary: string;
  whyItMatters: string;
  detectedAt: number;
  primaryMetric?: MetricKey;
  evidence: Evidence[];
  /** 0–1 */
  confidence: number;
  recommended: RecommendedAction[];
}

export interface HazardDriver {
  label: string;
  metric?: MetricKey;
  value: string;
  /** 0–100 contribution to the hazard score. */
  contribution: number;
  /** Plain-language phrase used when this driver is a concern, e.g. "sleep is more broken". */
  concern?: string;
}

export interface HazardAssessment {
  crewId: string;
  hazard: HazardKey;
  score: number;
  status: Status;
  drivers: HazardDriver[];
  /** Key figure for the hazard tile, e.g. "321 mSv · 53% of career limit". */
  headline: string;
  /** Plain-language explanation without scores or pronouns, suitable for the astronaut. */
  explanation: string;
}

export interface MetricInterpretation {
  crewId: string;
  metric: MetricKey;
  /** What changed. */
  summary: string;
  whyItMatters: string;
  /** Signals that move together with this one. */
  contributing: Evidence[];
  /** 0–1 */
  confidence: number;
  recommended: RecommendedAction[];
  trend: 'up' | 'down' | 'flat';
  status: Status;
}
