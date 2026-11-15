import { environment } from '../../../environments/environment';

export type DataSource = 'mock' | 'api';

const KEY = 'nh.data-source';

/** Which data layer to bind: build default, overridden by `?data=api|mock` (remembered). */
export function resolveDataSource(): DataSource {
  let source: DataSource = environment.dataSource;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'api' || stored === 'mock') source = stored;
    const param = new URLSearchParams(location.search).get('data');
    if (param === 'api' || param === 'mock') {
      source = param;
      localStorage.setItem(KEY, param);
    }
  } catch {
    // Storage blocked: keep the build default.
  }
  return source;
}

export const API_BASE_URL = environment.apiBaseUrl.replace(/\/+$/, '');
