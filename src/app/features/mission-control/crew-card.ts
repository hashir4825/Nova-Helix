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
import { HazardRing } from '../../shared/ui/hazard-ring';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON } from '../../shared/ui/icons';
import { MetricValue } from '../../shared/ui/metric-value';
import { Skeleton } from '../../shared/ui/skeleton';
import { Sparkline } from '../../shared/ui/sparkline';
import { StatusBadge } from '../../shared/ui/status-badge';
import { ClockPipe } from '../../shared/pipes';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { TipContent } from '../../shared/tooltip/tooltip.service';
import { HELP, METRIC_HELP, STATUS_HELP, hazardRingTip, hazardScoreTip } from '../../shared/help';
import { formatClock } from '../../core/util/format';

@Component({
  selector: 'nh-crew-card',
  imports: [RouterLink, StatusBadge, Sparkline, HazardRing, MetricValue, Icon, Skeleton, ClockPipe, TipDirective],
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
      const out = baseline && value !== null && (value < baseline.low || value > baseline.high);
      const fmt = (v: number) => `${v.toFixed(def.decimals)} ${def.unit}`;
      const vals = samples.map((x) => x.v);
      const tip: TipContent = {
        title: def.label,
        body: METRIC_HELP[key],
        rows: [
          ...(value !== null ? [{ label: live ? 'Now (live)' : 'Latest', value: fmt(value), tone: out ? ('watch' as const) : undefined }] : []),
          ...(baseline ? [{ label: 'Normal for ' + this.astronaut().name, value: `${baseline.low.toFixed(def.decimals)}–${fmt(baseline.high)}` }] : []),
          ...(vals.length ? [{ label: 'Last 24 h range', value: `${Math.min(...vals).toFixed(def.decimals)}–${fmt(Math.max(...vals))}` }] : []),
        ],
        hint: 'Click to open the full trend',
      };
      return {
        key,
        def,
        value,
        samples,
        baseline,
        out,
        tip,
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
    return { ...top, def: HAZARDS[top.hazard], icon: HAZARD_ICON[top.hazard] };
  });

  protected readonly ringTip = computed(() => hazardRingTip(this.astronaut().name, this.hazards()));
  protected readonly topTip = computed<TipContent | null>(() => {
    const top = this.topHazard();
    if (!top) return null;
    const t = hazardScoreTip(this.astronaut().name, top);
    return { ...t, title: `Highest hazard: ${top.def.label}` };
  });
  protected readonly statusTip = computed<TipContent | null>(() => {
    const s = this.summary();
    if (!s) return null;
    const h = STATUS_HELP[s.status];
    return { title: `${this.astronaut().name} is ${h.title}`, body: h.body };
  });
  protected readonly profileTip = computed(() => `Open ${this.astronaut().name}’s full health profile`);
  protected readonly checkInTip = computed<TipContent | null>(() => {
    const s = this.summary();
    if (!s) return null;
    return s.checkInHour !== null
      ? HELP.checkInDone(formatClock(s.checkInHour))
      : HELP.checkInDue(formatClock(this.checkInDueHour()));
  });
  protected readonly liveTip = HELP.live;

  protected readonly checkInDueHour = computed(() => {
    const a = this.astronaut();
    const wake = (a.sleepStartHour + 7.5) % 24;
    return (this.clock.day() - 1) * 24 + wake + 1;
  });
}
