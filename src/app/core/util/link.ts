import { LinkState, MissionConfig } from '../models';

const LIGHT_SECONDS_PER_AU = 499.005;

/** One-way light time to Earth from the mission trajectory at a mission hour. */
export function linkStateAt(config: MissionConfig, hour: number, autonomous: boolean): LinkState {
  const dayF = hour / 24;
  const i = Math.max(0, Math.min(config.trajectoryAu.length - 2, Math.floor(dayF)));
  const f = Math.max(0, Math.min(1, dayF - i));
  const au = config.trajectoryAu[i] * (1 - f) + config.trajectoryAu[i + 1] * f;
  return { mode: autonomous ? 'autonomous' : 'nominal', delaySeconds: au * LIGHT_SECONDS_PER_AU, distanceAu: au };
}
