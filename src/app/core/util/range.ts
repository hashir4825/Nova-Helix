import { Cadence } from '../models';

export type RangeKey = '24h' | '7d' | '30d' | 'mission';

export interface RangeDef {
  key: RangeKey;
  label: string;
  hours: number;
}

export const RANGES: RangeDef[] = [
  { key: '24h', label: '24 h', hours: 24 },
  { key: '7d', label: '7 days', hours: 24 * 7 },
  { key: '30d', label: '30 days', hours: 24 * 30 },
  { key: 'mission', label: 'Mission', hours: Number.POSITIVE_INFINITY },
];

/** Which ranges make sense for a metric's measurement cadence. */
export function allowedRanges(cadence: Cadence): RangeKey[] {
  switch (cadence) {
    case 'hourly':
      return ['24h', '7d', '30d', 'mission'];
    case 'daily':
    case 'session':
      return ['7d', '30d', 'mission'];
    default:
      return ['30d', 'mission'];
  }
}

export function defaultRange(cadence: Cadence): RangeKey {
  switch (cadence) {
    case 'hourly':
      return '7d';
    case 'daily':
    case 'session':
      return '30d';
    default:
      return 'mission';
  }
}

/** Window [from, to] in mission hours plus server aggregation bucket. */
export function rangeWindow(key: RangeKey, now: number, cadence: Cadence): { from: number; to: number; bucket: number } {
  const def = RANGES.find((r) => r.key === key) ?? RANGES[1];
  const from = Number.isFinite(def.hours) ? Math.max(0, now - def.hours) : 0;
  let bucket = 1;
  if (cadence === 'hourly') bucket = key === '30d' ? 4 : key === 'mission' ? 24 : 1;
  return { from, to: now, bucket };
}
