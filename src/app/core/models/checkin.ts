export type Symptom = 'headache' | 'nausea' | 'vision' | 'back-pain' | 'congestion' | 'other';

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  headache: 'Headache',
  nausea: 'Nausea',
  vision: 'Vision change',
  'back-pain': 'Back pain',
  congestion: 'Congestion',
  other: 'Other',
};

export interface CheckIn {
  id: string;
  crewId: string;
  /** Mission day (1-based). */
  day: number;
  /** Mission hour submitted. */
  at: number;
  /** 1–5 */
  mood: number;
  /** 1–5 */
  sleepQuality: number;
  /** 1–5 */
  energy: number;
  symptoms: Symptom[];
  note?: string;
}
