import { HazardKey } from './hazard';
import { MetricKey } from './metric';
import { Symptom } from './checkin';

// ── Questionnaires ──────────────────────────────────────────────────
export type QuestionnaireId = 'wellbeing' | 'sleep' | 'workload' | 'team';

export interface QuestionOption {
  value: number;
  label: string;
}

export interface Question {
  id: string;
  text: string;
  kind: 'scale' | 'text';
  /** For scale questions: 1..5 with labels. */
  options?: QuestionOption[];
  /** Higher answer = better (score is inverted). */
  reverse?: boolean;
  optional?: boolean;
}

export interface Questionnaire {
  id: QuestionnaireId;
  title: string;
  purpose: string;
  minutes: number;
  hazards: HazardKey[];
  /** Metric the score is written to (shared with Mission Control). */
  feeds?: MetricKey;
  /** What a high score means, e.g. "more stress". */
  scoreMeaning: string;
  questions: Question[];
}

export type AnswerValue = number | string;

export interface Assignment {
  id: string;
  crewId: string;
  questionnaireId: QuestionnaireId;
  assignedBy: string;
  note?: string;
  /** Mission hour assigned. */
  assignedAt: number;
  dueDay: number;
  status: 'assigned' | 'in-progress' | 'done';
  answers: Record<string, AnswerValue>;
  currentIndex: number;
  completedAt?: number;
  /** 0–100, higher = more strain. */
  score?: number;
}

// ── Check-in input ──────────────────────────────────────────────────
export interface CheckInDraft {
  mood: number;
  sleepQuality: number;
  energy: number;
  symptoms: Symptom[];
  note?: string;
}

// ── Nova companion (private) ────────────────────────────────────────
export type SafetyCategory = 'self-harm' | 'medical';

export type ChatCard =
  | { kind: 'checkin'; draft: CheckInDraft; status: 'proposed' | 'sent' | 'dismissed' }
  | { kind: 'share'; text: string; status: 'proposed' | 'sent' | 'dismissed' }
  | { kind: 'safety'; category: SafetyCategory }
  | { kind: 'breathing' };

export interface ChatMessage {
  id: string;
  role: 'astronaut' | 'nova';
  text: string;
  /** Mission hour. */
  at: number;
  card?: ChatCard;
}

/** Raised only under the safety exception. Carries no transcript. */
export interface SafetyFlag {
  id: string;
  crewId: string;
  at: number;
  category: SafetyCategory;
}

/** Text the astronaut explicitly chose to share with the flight surgeon. */
export interface SharedNote {
  id: string;
  crewId: string;
  at: number;
  text: string;
}
