import { Status } from './status';

export type CrewRole = 'CDR' | 'FE' | 'MS' | 'CMO';

export const ROLE_LABEL: Record<CrewRole, string> = {
  CDR: 'Commander',
  FE: 'Flight Engineer',
  MS: 'Mission Specialist',
  CMO: 'Crew Medical Officer',
};

/**
 * Personal baseline for one metric, established from the astronaut's own data
 * (in-flight reference window D8–D40, or preflight for musculoskeletal).
 * Never a population average.
 */
export interface Baseline {
  mean: number;
  low: number;
  high: number;
  /** Human-readable source window, e.g. "In-flight D8–D40". */
  source: string;
}

export interface Astronaut {
  id: string;
  name: string;
  role: CrewRole;
  callsign: string;
  age: number;
  agency: string;
  /** Ship time (UTC) the sleep period starts, hour of day. */
  sleepStartHour: number;
  /** Ship time the daily exercise block starts. */
  exerciseHour: number;
  /** Short persona description, shown in the profile header. */
  persona: string;
}

export interface CrewSummary {
  crewId: string;
  status: Status;
  /** Mission hour of today's check-in, or null if not yet done today. */
  checkInHour: number | null;
  nextEvent: { label: string; day: number } | null;
}
