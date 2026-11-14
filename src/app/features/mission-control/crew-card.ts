import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, map, switchMap } from 'rxjs';
import { TelemetryApi } from '../../core/data/apis';
import {
  Astronaut,
  CARD_VITALS,
  CrewSummary,
  HAZARDS,
  HazardAssessment,
  METRICS,
  ROLE_LABEL,
} from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { formatSigned } from '../../core/util/format';
import { HazardRing } from '../../shared/ui/hazard-ring';
import { Icon } from '../../shared/ui/icon';
import { ICON } from '../../shared/ui/icons';
import { MetricValue } from '../../shared/ui/metric-value';
import { Skeleton } from '../../shared/ui/skeleton';
import { Sparkline } from '../../shared/ui/sparkline';
import { StatusBadge } from '../../shared/ui/status-badge';
import { ClockPipe } from '../../shared/pipes';

@Component({
  selector: 'nh-crew-card',
  imports: [RouterLink, StatusBadge, Sparkline, HazardRing, MetricValue, Icon, Skeleton, ClockPipe],
  templateUrl: './crew-card.html',
  styleUrl: './crew-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'status-' + (summary()?.status ?? 'loading')",
  },
})
export class CrewCard {
  readonly astronaut = input.required<Astronaut>();
  readonly summary = input<CrewSummary | undefined>(undefined);
  readonly hazards = input<HazardAssessment[]>([]);

  private readonly telemetry = inject(TelemetryApi);
  protected readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly roleLabel = ROLE_LABEL;

  private readonly id$ = toObservable(computed(() => this.astronaut().id));
  private readonly hour$ = toObservable(this.clock.queryHour);

  /** Live readings (only meaningful while the clock is live). */
  private readonly live = toSignal(this.id$.pipe(switchMap((id) => this.telemetry.live(id))));

  /** 24 h history + personal baselines for the card vitals. */
  private readonly history = toSignal(
    combineLatest([this.id$, this.hour$]).pipe(
      switchMap(([id, hour]) =>
        combineLatest(
          CARD_VITALS.map((k) =>
            combineLatest([this.telemetry.series(id, k, hour - 24, hour), this.telemetry.baseline(id, k)]).pipe(
              map(([samples, baseline]) => ({ key: k, samples, baseline })),
            ),
          ),
        ),
      ),
    ),
  );

  protected readonly vitals = computed(() => {
    const h = this.history();
    if (!h) return null;
    const live = this.clock.isLive() ? this.live() : undefined;
    return h.map(({ key, samples, baseline }) => {
      const def = METRICS[key];
      const value = live?.values[key] ?? samples.at(-1)?.v ?? null;
      const delta = value !== null && baseline ? value - baseline.mean : null;
      const out = baseline && value !== null && (value < baseline.low || value > baseline.high);
      return {
        key,
        def,
        value,
        samples,
        baseline,
        delta: delta === null ? '' : formatSigned(delta, def.decimals),
        out,
        aria: `${def.label} ${value?.toFixed(def.decimals) ?? 'no data'} ${def.unit}${
          baseline ? `, personal baseline ${baseline.low.toFixed(def.decimals)} to ${baseline.high.toFixed(def.decimals)}` : ''
        }${out ? ', outside baseline' : ''}. Open detail.`,
      };
    });
  });

  protected readonly topHazard = computed(() => {
    const hz = this.hazards();
    if (!hz.length) return null;
    const top = hz.reduce((a, b) => (b.score > a.score ? b : a));
    return { ...top, def: HAZARDS[top.hazard] };
  });

  protected readonly checkInDueHour = computed(() => {
    const a = this.astronaut();
    const wake = (a.sleepStartHour + 7.5) % 24;
    return (this.clock.day() - 1) * 24 + wake + 1;
  });
}
