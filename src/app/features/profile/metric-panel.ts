import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { MissionApi, TelemetryApi } from '../../core/data/apis';
import { METRICS, MetricKey } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { formatMetric } from '../../core/util/format';
import { RangeKey, rangeWindow } from '../../core/util/range';
import { TrendChart } from '../../shared/charts/trend-chart';
import { METRIC_HELP } from '../../shared/help';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { TipContent } from '../../shared/tooltip/tooltip.service';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';

/** One measurement: latest value + trend with personal baseline. Click opens the Metric Detail sheet. */
@Component({
  selector: 'nh-metric-panel',
  imports: [TrendChart, Skeleton, Icon, TipDirective, RouterLink],
  template: `
    @let d = def();
    <article class="mp">
      <header class="mp-head">
        <div class="mp-title" tabindex="0" [nhTip]="tip()">
          <h4>{{ title() || d.label }}</h4>
          <span class="mp-hz" aria-hidden="true">
            @for (h of d.hazards; track h) {
              <nh-icon [icon]="hazardIcon[h]" [size]="12" />
            }
          </span>
        </div>
        @if (latest(); as l) {
          <span class="mp-v" [class.out]="out()">{{ fmt(l.v) }}</span>
        }
        <a
          class="mp-open"
          [routerLink]="[]"
          [queryParams]="{ metric: crewId() + ':' + metric() }"
          queryParamsHandling="merge"
          [attr.aria-label]="'Open ' + d.label + ' detail'"
          nhTip="Open full trend and analysis"
        >
          <nh-icon [icon]="icons.arrowUpRight" [size]="16" />
        </a>
      </header>
      @if (samples(); as s) {
        <nh-trend-chart
          [metric]="metric()"
          [samples]="s"
          [baseline]="baseline() ?? null"
          [from]="win().from"
          [to]="win().to"
          [events]="events()"
          [kind]="kind()"
          [height]="height()"
          [bandLabel]="bandLabel()"
          [limit]="limit()"
          [showThresholds]="showThresholds()"
        />
      } @else {
        <nh-skeleton [h]="height() + 'px'" />
      }
      <p class="mp-foot">{{ rangeLabel() }}</p>
    </article>
  `,
  styles: `
    @use 'mixins' as *;
    :host {
      display: block;
      min-width: 0;
    }
    .mp {
      @include panel;
      padding: var(--space-4);
      display: grid;
      gap: var(--space-2);
      height: 100%;
    }
    .mp-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .mp-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      flex: 1;
      cursor: help;
      border-radius: var(--radius-1);
      h4 {
        font-size: var(--type-body);
        font-weight: var(--weight-semibold);
        @include truncate;
      }
    }
    .mp-hz {
      display: inline-flex;
      gap: 2px;
      color: var(--text-3);
    }
    .mp-v {
      @include mono;
      font-size: var(--type-body);
      color: var(--text-1);
      white-space: nowrap;
      &.out {
        color: var(--watch);
      }
    }
    .mp-open {
      @include focus-ring;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      color: var(--text-3);
      &:hover {
        color: var(--accent);
        background: var(--accent-soft);
      }
    }
    .mp-foot {
      font-size: var(--type-micro);
      color: var(--text-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricPanel {
  readonly crewId = input.required<string>();
  readonly metric = input.required<MetricKey>();
  readonly title = input('');
  readonly range = input<RangeKey>('30d');
  readonly kind = input<'line' | 'bar'>('line');
  readonly height = input(150);
  readonly bandLabel = input('Normal');
  readonly showThresholds = input(true);
  readonly limit = input<{ value: number; label: string } | null>(null);

  private readonly telemetry = inject(TelemetryApi);
  private readonly mission = inject(MissionApi);
  private readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly hazardIcon = HAZARD_ICON;

  protected readonly def = computed(() => METRICS[this.metric()]);
  protected readonly win = computed(() => rangeWindow(this.range(), this.clock.queryHour(), this.def().cadence));
  private readonly args$ = toObservable(computed(() => ({ crew: this.crewId(), metric: this.metric(), w: this.win() })));

  protected readonly samples = toSignal(this.args$.pipe(switchMap((a) => this.telemetry.series(a.crew, a.metric, a.w.from, a.w.to, a.w.bucket))));
  protected readonly baseline = toSignal(this.args$.pipe(switchMap((a) => this.telemetry.baseline(a.crew, a.metric))));
  protected readonly events = toSignal(this.args$.pipe(switchMap((a) => this.mission.timeline(a.crew, a.w.from, a.w.to))), { initialValue: [] });

  protected readonly latest = computed(() => this.samples()?.at(-1) ?? null);
  protected readonly out = computed(() => {
    const l = this.latest();
    const b = this.baseline();
    if (!l || !b) return false;
    const d = this.def();
    return (l.v < b.low && d.concern !== 'high') || (l.v > b.high && d.concern !== 'low');
  });

  protected readonly rangeLabel = computed(() => {
    const r = this.range();
    const span = r === '24h' ? 'Last 24 hours' : r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'Whole mission';
    return `${span} · ${this.def().source}`;
  });

  protected readonly tip = computed<TipContent>(() => {
    const b = this.baseline();
    const d = this.def();
    return {
      title: d.label,
      body: METRIC_HELP[d.key],
      rows: b ? [{ label: 'Personal normal', value: `${formatMetric(d.key, b.low, false)}–${formatMetric(d.key, b.high)}` }] : [],
      hint: 'Use the arrow to open the full trend',
    };
  });

  protected fmt(v: number): string {
    return formatMetric(this.metric(), v);
  }
}
