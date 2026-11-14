import { Injectable, signal } from '@angular/core';

/** Who is using the app. The landing page (M0) will set these; until then defaults apply. */
export type Role = 'surgeon' | 'astronaut';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  /** Flight surgeon = admin, sees every astronaut. Astronaut sees only their own data. */
  readonly role = signal<Role>('surgeon');
  /** The astronaut using Crew Mode. */
  readonly astronautId = signal('hashir');
}
