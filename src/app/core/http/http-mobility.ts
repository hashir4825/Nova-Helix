import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { MobilityApi } from '../data/apis';
import {
  MobilityAlert,
  MobilityCheck,
  MobilityHistory,
  MobilityMeasurement,
  MobilityMethod,
  MobilityResult,
  MobilitySubmission,
  MobilityTestKey,
  Status,
} from '../models';
import { ApiClient } from './api-client';

/*
 * Mobility endpoints (backend docs/BACKEND_UPDATE.md §2.1): camelCase JSON, nominal/watch/alert,
 * crew ids as slugs, no ?day=. Responses are read tolerantly (old snake_case + green/amber/red too)
 * so a backend mid-migration still works. This file is the only place that knows the wire format.
 */

type Json = Record<string, unknown>;
const LEVEL: Record<string, Status> = { nominal: 'nominal', watch: 'watch', alert: 'alert', green: 'nominal', amber: 'watch', red: 'alert' };
const status = (v: unknown): Status => LEVEL[String(v)] ?? 'nominal';
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
/** First present field among camelCase / snake_case spellings. */
const pick = (o: Json | null, ...keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const numMap = (v: unknown): Record<string, number> => {
  const o = obj(v);
  const out: Record<string, number> = {};
  if (o) for (const [k, x] of Object.entries(o)) if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
  return out;
};

const ADVICE: Pick<MobilityAlert, 'why' | 'source'> = {
  why: 'Reduced balance or leg strength raises fall and injury risk on arrival, when gravity returns.',
  source: 'Pose keypoints measured on the device; thresholds are illustrative, not clinical.',
};

/** The new API has no alert block: build the headline and advice from the tests. */
function alertFor(s: Status, tests: MobilityResult['tests'], checksUsed: number): MobilityAlert {
  const flagged = tests.filter((t) => t.status !== 'nominal').map((t) => t.label.toLowerCase());
  if (s === 'nominal' || !flagged.length) {
    return {
      what: checksUsed <= 1 ? 'First check saved. Later checks are compared with this one.' : 'All three movement tests are within the usual range.',
      action: 'No action needed. Repeat the check next week.',
      ...ADVICE,
    };
  }
  return { what: `Movement check flagged: ${flagged.join(', ')}.`, action: 'Review the resistive exercise plan and repeat the check within 3 days.', ...ADVICE };
}

function toResult(v: unknown): MobilityResult | null {
  const r = obj(v);
  const rawTests = r?.['tests'];
  if (!r || !Array.isArray(rawTests)) return null;
  const tests = rawTests.map((x) => {
    const t = obj(x) ?? {};
    const base = numMap(t['baseline']);
    return {
      test: t['test'] as MobilityTestKey,
      label: String(t['label'] ?? t['test'] ?? ''),
      status: status(pick(t, 'status', 'level')),
      values: numMap(t['values']),
      baseline: Object.keys(base).length ? base : null,
      changePct: numMap(pick(t, 'changePct', 'change_pct')),
      note: String(t['note'] ?? ''),
    };
  });
  const s = status(pick(r, 'status', 'level'));
  const checksUsed = num(pick(r, 'checksUsed', 'checks_used')) ?? 1;
  const a = obj(r['alert']);
  return {
    status: s,
    tests,
    alert: a ? { what: String(a['what'] ?? ''), why: String(a['why'] ?? ''), action: String(a['action'] ?? ''), source: String(a['source'] ?? '') } : alertFor(s, tests, checksUsed),
    checksUsed,
    lastCheckDay: num(pick(r, 'lastCheckDay', 'last_check_day')) ?? 0,
    lastCheckAt: num(pick(r, 'lastCheckAt', 'last_check_at')),
  };
}

function toMeasurement(v: unknown): MobilityMeasurement | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const m = {
    balanceHoldS: num(pick(o, 'balanceHoldS', 'balance_hold_s')),
    swayPctHeight: num(pick(o, 'swayPctHeight', 'sway_pct_height')),
    sitToStandS: num(pick(o, 'sitToStandS', 'sit_to_stand_5x_s')),
    kneeFlexionDeg: num(pick(o, 'kneeFlexionDeg', 'knee_flexion_deg')),
    poseConfidence: num(pick(o, 'poseConfidence', 'pose_confidence')),
  };
  return Object.values(m).every((x) => x !== undefined) ? (m as MobilityMeasurement) : undefined;
}

function toCheck(v: unknown, crewId: string): MobilityCheck {
  const c = obj(v) ?? {};
  return {
    id: String(c['id'] ?? ''),
    crewId: String(pick(c, 'crewId', 'astronaut_id') ?? crewId),
    day: num(pick(c, 'day', 'mission_day')) ?? 0,
    at: num(c['at']),
    reliable: c['reliable'] !== false,
    // Values sit under `measurements` (new), `values`, or on the check itself (old).
    measurement: toMeasurement(pick(c, 'measurements', 'values')) ?? toMeasurement(c),
    status: pick(c, 'status', 'level') !== undefined ? status(pick(c, 'status', 'level')) : undefined,
  };
}

/** Threshold by meaning, whatever the key spelling (balanceHoldWatchS, balance_hold_amber_s, ...). */
function threshold(t: Json | null, subject: RegExp, level: 'watch' | 'alert', fallback: number): number {
  const lv = level === 'watch' ? /(watch|amber)/i : /(alert|red)/i;
  const hit = t && Object.entries(t).find(([k, v]) => subject.test(k) && lv.test(k) && typeof v === 'number');
  return hit ? (hit[1] as number) : fallback;
}

function toMethod(v: unknown): MobilityMethod {
  const w = obj(v) ?? {};
  const t = obj(w['thresholds']);
  const tests = Array.isArray(w['tests']) ? w['tests'] : [];
  return {
    title: String(w['title'] ?? 'Mobility & Balance Check'),
    tests: tests.map((x) => {
      const o = obj(x) ?? {};
      return {
        test: o['test'] as MobilityTestKey,
        label: String(o['label'] ?? ''),
        durationS: num(pick(o, 'durationS', 'duration_s')) ?? 30,
        instructions: String(o['instructions'] ?? ''),
      };
    }),
    minPoseConfidence: num(pick(w, 'minPoseConfidence', 'min_pose_confidence')) ?? 0.6,
    // Fallbacks = the backend's published thresholds, used only if a key is missing.
    thresholds: {
      balanceHoldWatchS: threshold(t, /balance/i, 'watch', 10),
      balanceHoldAlertS: threshold(t, /balance/i, 'alert', 5),
      sitToStandWatchS: threshold(t, /sit/i, 'watch', 12),
      sitToStandAlertS: threshold(t, /sit/i, 'alert', 15),
      kneeFlexionWatchDeg: threshold(t, /knee/i, 'watch', 100),
      kneeFlexionAlertDeg: threshold(t, /knee/i, 'alert', 80),
      worseThanFirstWatch: threshold(t, /(worse|first)/i, 'watch', 0.25),
      worseThanFirstAlert: threshold(t, /(worse|first)/i, 'alert', 0.5),
    },
    limits: String(w['limits'] ?? ''),
  };
}

function apiError(e: unknown): Observable<never> {
  if (e instanceof HttpErrorResponse) {
    const d: unknown = e.error?.detail;
    const msg =
      typeof d === 'string'
        ? d
        : Array.isArray(d)
          ? d.map((x: { msg?: string }) => x.msg ?? '').filter(Boolean).join('; ')
          : e.status === 0
            ? 'Cannot reach the server. Check the connection and try again.'
            : `Server error ${e.status}`;
    return throwError(() => new Error(msg || `Server error ${e.status}`));
  }
  return throwError(() => e);
}

@Injectable({ providedIn: 'root' })
export class HttpMobilityApi extends MobilityApi {
  private readonly api = inject(ApiClient);
  private readonly method$ = this.api.get<unknown>('/api/mobility/method').pipe(map(toMethod), shareReplay(1));

  method(): Observable<MobilityMethod> {
    return this.method$;
  }

  submit(crewId: string, m: MobilityMeasurement): Observable<MobilitySubmission> {
    const body = {
      balanceHoldS: m.balanceHoldS,
      swayPctHeight: m.swayPctHeight,
      sitToStandS: m.sitToStandS,
      kneeFlexionDeg: m.kneeFlexionDeg,
      poseConfidence: m.poseConfidence,
    };
    return this.api.post<Json>(`/api/mobility/${encodeURIComponent(crewId)}`, body).pipe(
      map((r) => {
        const check = toCheck(r['check'], crewId);
        return {
          check: { ...check, measurement: check.measurement ?? m },
          counted: r['counted'] !== false,
          message: String(r['message'] ?? ''),
          result: toResult(r['result']),
        };
      }),
      catchError(apiError),
    );
  }

  history(crewId: string): Observable<MobilityHistory> {
    return this.api.watch<Json>(`/api/mobility/${encodeURIComponent(crewId)}`).pipe(
      map((h) => {
        const latest = obj(h['latest']);
        return {
          crewId,
          checks: (Array.isArray(h['checks']) ? h['checks'] : []).map((c) => toCheck(c, crewId)),
          // `latest` may be a result, or a check carrying a `result`.
          latest: toResult(latest?.['result'] ?? latest),
        };
      }),
    );
  }
}
