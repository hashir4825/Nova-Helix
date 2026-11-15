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

/** What specifically triggered the safety exception (a category, never the astronaut's words). */
export type SafetySignal =
  | 'wish-to-die'
  | 'suicidal-thoughts'
  | 'self-harm-intent'
  | 'confirmed-when-asked'
  | 'chest-pain'
  | 'breathing'
  | 'stroke-signs'
  | 'unconscious'
  | 'vision-loss'
  | 'severe-headache'
  | 'seizure';

export const SAFETY_SIGNAL_LABEL: Record<SafetySignal, string> = {
  'wish-to-die': 'expressed a wish to die',
  'suicidal-thoughts': 'expressed suicidal thoughts',
  'self-harm-intent': 'expressed intent to harm themself',
  'confirmed-when-asked': 'said yes when Nova asked about thoughts of self-harm',
  'chest-pain': 'reported chest pain',
  breathing: 'reported difficulty breathing',
  'stroke-signs': 'reported stroke-like symptoms (numbness or slurred speech)',
  unconscious: 'reported fainting or blacking out',
  'vision-loss': 'reported sudden loss of vision',
  'severe-headache': 'reported a sudden severe headache',
  seizure: 'reported a seizure',
};

/** Raised only under the safety exception. Carries no transcript. */
export interface SafetyFlag {
  id: string;
  crewId: string;
  at: number;
  category: SafetyCategory;
  signal: SafetySignal;
}

// ── Mission Control actions ─────────────────────────────────────────
export type LogKind = 'acknowledge' | 'contact' | 'in-person' | 'psych' | 'medical' | 'escalate' | 'countermeasure' | 'questionnaire' | 'resolve' | 'reopen';

export interface ActionLogEntry {
  id: string;
  insightId: string;
  crewId: string | null;
  at: number;
  by: string;
  kind: LogKind;
  label: string;
  detail?: string;
}

/** Text the astronaut explicitly chose to share with the flight surgeon. */
export interface SharedNote {
  id: string;
  crewId: string;
  at: number;
  text: string;
}

// ── Nova companion wire format (POST /api/crew/{id}/companion/reply) ──
/** Conversation state Nova needs between turns; the client keeps it and sends it back (the server stores nothing). */
export interface CompanionState {
  /** Nova asked a direct safety question and is waiting for the answer. */
  pendingSafetyCheck: boolean;
  /** Nova asked the astronaut to describe their day for a check-in. */
  awaitingCheckIn: boolean;
}

export interface CompanionRequest {
  /** The astronaut's new message. Omitted = start of conversation (Nova greets). */
  text?: string;
  /** Recent turns for context only, oldest first. Must not be stored or logged by the server. */
  history: { role: ChatMessage['role']; text: string }[];
  state: CompanionState;
}

export interface CompanionTurn {
  replies: { text: string; card?: ChatCard }[];
  state: CompanionState;
  /** Set when the safety exception fired; the server has already raised the alert (category only). */
  safety?: { category: SafetyCategory; signal: SafetySignal };
}
