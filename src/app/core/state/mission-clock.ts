import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AnalysisQuery, MissionApi } from '../data/apis';
import { LinkState, MissionConfig } from '../models';
import { linkStateAt } from '../util/link';

const HOUR_MS = 3_600_000;

/**
 * Mission time and Earth link. Live by default; the Scenario Player can pin
 * `viewHour` to replay history and toggle autonomous (link-loss) mode.
 */
@Injectable({ providedIn: 'root' })
export class MissionClock {
  private readonly api = inject(MissionApi);
  private _config: MissionConfig | null = null;

  readonly nowMs = signal(Date.now());
  /** Null = live. Otherwise a mission hour being replayed. */
  readonly viewHour = signal<number | null>(null);
  /** Simulation: Earth link lost. */
  readonly autonomous = signal(false);

  constructor() {
    const id = setInterval(() => this.nowMs.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  /** Called from the app initializer before first render. */
  async load(): Promise<void> {
    this._config = await firstValueFrom(this.api.config());
    this.nowMs.set(Date.now());
  }

  get config(): MissionConfig {
    if (!this._config) throw new Error('MissionClock used before load()');
    return this._config;
  }

  readonly liveHour = computed(() => (this.nowMs() - this.config.launchEpochMs) / HOUR_MS);
  readonly isLive = computed(() => this.viewHour() === null);
  readonly hour = computed(() => this.viewHour() ?? this.liveHour());
  /** Changes once per quarter hour: drives data re-queries. */
  readonly queryHour = computed(() => Math.floor(this.hour() * 4) / 4);
  readonly day = computed(() => Math.floor(this.hour() / 24) + 1);
  readonly liveDay = computed(() => Math.floor(this.liveHour() / 24) + 1);
  readonly utc = computed(() => new Date(this.config.launchEpochMs + this.hour() * HOUR_MS));

  readonly link = computed<LinkState>(() => linkStateAt(this.config, this.hour(), this.autonomous()));

  readonly query = computed<AnalysisQuery>(
    () => ({ atHour: this.queryHour(), autonomous: this.autonomous() }),
    { equal: (a, b) => a.atHour === b.atHour && a.autonomous === b.autonomous },
  );
}
