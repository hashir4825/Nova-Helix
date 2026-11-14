import { METRICS, MetricKey } from '../models';

const pad = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0');

/** Mission day (1-based) for a mission hour. */
export const missionDay = (hour: number): number => Math.floor(hour / 24) + 1;

/** "D142 14:32" */
export function formatMissionTime(hour: number): string {
  const d = missionDay(hour);
  const hod = hour - (d - 1) * 24;
  const hh = Math.floor(hod);
  const mm = Math.floor((hod - hh) * 60);
  return `D${d} ${pad(hh)}:${pad(mm)}`;
}

/** "14:32" ship time (UTC). */
export function formatClock(hour: number): string {
  const hod = ((hour % 24) + 24) % 24;
  const hh = Math.floor(hod);
  const mm = Math.floor((hod - hh) * 60);
  return `${pad(hh)}:${pad(mm)}`;
}

/** "3h ago", "2d ago", "in 3d". */
export function formatRelative(hour: number, now: number): string {
  const diff = now - hour;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? ' ago' : '';
  const prefix = diff < 0 ? 'in ' : '';
  if (abs < 1 / 60) return 'now';
  if (abs < 1) return `${prefix}${Math.round(abs * 60)}m${suffix}`;
  if (abs < 48) return `${prefix}${Math.round(abs)}h${suffix}`;
  return `${prefix}${Math.round(abs / 24)}d${suffix}`;
}

/** "5m 29s" */
export function formatDelay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${pad(s)}s`;
}

export function formatNumber(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(decimals);
}

export function formatMetric(metric: MetricKey, v: number, withUnit = true): string {
  const def = METRICS[metric];
  const n = formatNumber(v, def.decimals);
  if (!withUnit) return n;
  return def.unit.startsWith('/') || def.unit === '%' || def.unit === '°C' ? `${n}${def.unit}` : `${n} ${def.unit}`;
}

export function formatSigned(v: number, decimals: number): string {
  const n = Math.abs(v).toFixed(decimals);
  if (Number(n) === 0) return `±${n}`;
  return `${v > 0 ? '+' : '−'}${n}`;
}

export function formatPct(v: number, decimals = 0): string {
  return `${formatSigned(v, decimals)}%`;
}
