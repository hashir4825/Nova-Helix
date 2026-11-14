export type Status = 'nominal' | 'watch' | 'alert';
export type Severity = 'alert' | 'watch' | 'info';

export const STATUS_LABEL: Record<Status, string> = {
  nominal: 'Nominal',
  watch: 'Watch',
  alert: 'Alert',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  alert: 'Alert',
  watch: 'Watch',
  info: 'Info',
};

const STATUS_RANK: Record<Status, number> = { nominal: 0, watch: 1, alert: 2 };
export const SEVERITY_RANK: Record<Severity, number> = { info: 0, watch: 1, alert: 2 };

export function worstStatus(...statuses: Status[]): Status {
  return statuses.reduce<Status>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'nominal');
}

export function severityToStatus(s: Severity): Status {
  return s === 'info' ? 'nominal' : s;
}

/** Hazard score (0–100) to status level. */
export function scoreToStatus(score: number): Status {
  if (score >= 70) return 'alert';
  if (score >= 40) return 'watch';
  return 'nominal';
}
