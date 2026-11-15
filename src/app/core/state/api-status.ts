import { Injectable, signal } from '@angular/core';
import { resolveDataSource } from '../data/data-source';

/** Where data comes from, and whether the backend is reachable (api mode only). */
@Injectable({ providedIn: 'root' })
export class ApiStatus {
  readonly source = resolveDataSource();
  readonly unreachable = signal(false);
}
