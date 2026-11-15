import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { ApiStatus } from '../state/api-status';
import { BehaviorSubject, EMPTY, Observable, catchError, distinctUntilChanged, filter, interval, map, merge, switchMap, tap } from 'rxjs';

export const API_BASE = new InjectionToken<string>('Nova Healix API base URL');

/** How often re-emitting streams refresh (other users' actions, new findings). */
const POLL_MS = 15_000;

export type Params = Record<string, string | number | boolean | null | undefined>;

function toParams(p?: Params): HttpParams {
  let hp = new HttpParams();
  for (const [k, v] of Object.entries(p ?? {})) if (v !== null && v !== undefined) hp = hp.set(k, String(v));
  return hp;
}

/**
 * Thin JSON client for the Nova Healix backend.
 * `watch` gives the "re-emits on change" behaviour the API contracts promise:
 * it refetches after every write made through this client and on a slow poll.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);
  private readonly changed$ = new BehaviorSubject(0);

  /** True while the backend cannot be reached (shown as a banner). */
  readonly unreachable = inject(ApiStatus).unreachable;

  private url(path: string): string {
    return `${this.base}${path}`;
  }

  private ok = <T>(src: Observable<T>): Observable<T> =>
    src.pipe(
      tap({
        next: () => this.unreachable.set(false),
        error: (e: unknown) => {
          if (e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 500)) this.unreachable.set(true);
        },
      }),
    );

  get<T>(path: string, params?: Params): Observable<T> {
    return this.ok(this.http.get<T>(this.url(path), { params: toParams(params) }));
  }

  /** GET that re-emits after writes and every POLL_MS (skipped while the tab is hidden). */
  watch<T>(path: string, params?: Params, everyMs = POLL_MS): Observable<T> {
    const visible = () => typeof document === 'undefined' || !document.hidden;
    return merge(this.changed$, interval(everyMs).pipe(filter(visible))).pipe(
      switchMap(() => this.get<T>(path, params).pipe(catchError(() => EMPTY))),
      map((v) => ({ v, key: JSON.stringify(v) })),
      distinctUntilChanged((a, b) => a.key === b.key),
      map(({ v }) => v),
    );
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.ok(this.http.post<T>(this.url(path), body)).pipe(tap(() => this.changed$.next(this.changed$.value + 1)));
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.ok(this.http.put<T>(this.url(path), body)).pipe(tap(() => this.changed$.next(this.changed$.value + 1)));
  }

  /** POST that does not change shared data (no refetch), e.g. a Nova reply. */
  call<T>(path: string, body: unknown): Observable<T> {
    return this.ok(this.http.post<T>(this.url(path), body));
  }
}
