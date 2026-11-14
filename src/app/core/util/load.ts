import { Observable, catchError, map, of, startWith } from 'rxjs';

export type Load<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; message: string };

/** Wrap a data stream with loading / error states for templates. */
export function withLoad<T>(src: Observable<T>): Observable<Load<T>> {
  return src.pipe(
    map((value): Load<T> => ({ state: 'ready', value })),
    startWith<Load<T>>({ state: 'loading' }),
    catchError((e: unknown) => of<Load<T>>({ state: 'error', message: e instanceof Error ? e.message : 'Data unavailable' })),
  );
}

export const LOADING = { state: 'loading' } as const;
