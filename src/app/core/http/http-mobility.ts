import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { MobilityApi } from '../data/apis';
import {
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
 * The mobility endpoints are kept exactly as the backend built them (snake_case fields,
 * green/amber/red levels). This file is the only place that knows that wire format.
 * See docs/BACKEND_API_GUIDE.md, "Mobility & balance check".
 */

type Level = 'green' | 'amber' | 'red';
const LEVEL: Record<Level, Status> = { green: 'nominal', amber: 'watch', red: 'alert' };
const status = (l: unknown): Status => LEVEL[l as Level] ?? 'nominal';
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

interface WireTest {
  test: MobilityTestKey;
  label: string;
  level: Level;
  values?: Record<string, number>;
  baseline?: Record<string, number> | null;
  change_pct?: Record<string, number> | null;
  note?: string;
}
interface WireResult {
  level: Level;
  tests?: WireTest[];
  alert?: { what: string; why: string; action: string; source: string } | null;
  checks_used?: number;
  last_check_day?: number;
}
type WireCheck = Record<string, unknown>;

function toResult(r: WireResult | null | undefined): MobilityResult | null {
  if (!r || !Array.isArray(r.tests)) return null;
  return {
    status: status(r.level),
    tests: r.tests.map((t) => ({
      test: t.test,
      label: t.label,
      status: status(t.level),
      values: t.values ?? {},
      baseline: t.baseline && Object.keys(t.baseline).length ? t.baseline : null,
      changePct: t.change_pct ?? {},
      note: t.note ?? '',
    })),
    alert: r.alert ? { what: r.alert.what, why: r.alert.why, action: r.alert.action, source: r.alert.source } : null,
    checksUsed: r.checks_used ?? 1,
    lastCheckDay: r.last_check_day ?? 0,
  };
}

function toCheck(c: WireCheck, crewId: string): MobilityCheck {
  // Values may sit on the check itself or under `values`.
  const v = (c['values'] && typeof c['values'] === 'object' ? c['values'] : c) as Record<string, unknown>;
  const m: Partial<MobilityMeasurement> = {
    balanceHoldS: num(v['balance_hold_s']),
    swayPctHeight: num(v['sway_pct_height']),
    sitToStand5xS: num(v['sit_to_stand_5x_s']),
    kneeFlexionDeg: num(v['knee_flexion_deg']),
    poseConfidence: num(v['pose_confidence']),
  };
  const complete = Object.values(m).every((x) => x !== undefined);
  return {
    id: String(c['id'] ?? ''),
    crewId,
    day: num(c['mission_day']) ?? 0,
    reliable: c['reliable'] !== false,
    measurement: complete ? (m as MobilityMeasurement) : undefined,
    status: c['level'] ? status(c['level']) : undefined,
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

  private readonly method$ = this.api
    .get<{
      title: string;
      tests: { test: MobilityTestKey; label: string; duration_s: number; instructions: string }[];
      min_pose_confidence: number;
      thresholds: Record<string, number>;
      limits: string;
    }>('/api/mobility/method')
    .pipe(
      map(
        (w): MobilityMethod => ({
          title: w.title,
          tests: w.tests.map((t) => ({ test: t.test, label: t.label, durationS: t.duration_s, instructions: t.instructions })),
          minPoseConfidence: w.min_pose_confidence,
          thresholds: {
            balanceHoldWatchS: w.thresholds['balance_hold_amber_s'],
            balanceHoldAlertS: w.thresholds['balance_hold_red_s'],
            sitToStandWatchS: w.thresholds['sit_to_stand_amber_s'],
            sitToStandAlertS: w.thresholds['sit_to_stand_red_s'],
            kneeFlexionWatchDeg: w.thresholds['knee_flexion_amber_deg'],
            kneeFlexionAlertDeg: w.thresholds['knee_flexion_red_deg'],
            worseThanFirstWatch: w.thresholds['worse_than_first_check_amber'],
            worseThanFirstAlert: w.thresholds['worse_than_first_check_red'],
          },
          limits: w.limits,
        }),
      ),
      shareReplay(1),
    );

  method(): Observable<MobilityMethod> {
    return this.method$;
  }

  submit(crewId: string, m: MobilityMeasurement): Observable<MobilitySubmission> {
    const body = {
      balance_hold_s: m.balanceHoldS,
      sway_pct_height: m.swayPctHeight,
      sit_to_stand_5x_s: m.sitToStand5xS,
      knee_flexion_deg: m.kneeFlexionDeg,
      pose_confidence: m.poseConfidence,
    };
    return this.api.post<{ check: WireCheck; counted: boolean; message: string; result: WireResult | null }>(`/api/mobility/${encodeURIComponent(crewId)}`, body).pipe(
      map((r) => ({
        check: toCheck({ ...r.check, values: body }, crewId),
        counted: r.counted,
        message: r.message,
        result: toResult(r.result),
      })),
      catchError(apiError),
    );
  }

  history(crewId: string): Observable<MobilityHistory> {
    return this.api.watch<{ astronaut_id: string; checks?: WireCheck[]; latest?: (WireResult & { result?: WireResult }) | null }>(`/api/mobility/${encodeURIComponent(crewId)}`).pipe(
      map((h) => ({
        crewId,
        checks: (h.checks ?? []).map((c) => toCheck(c, crewId)),
        latest: toResult(h.latest?.result ?? h.latest),
      })),
    );
  }
}
