import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, map, switchMap } from 'rxjs';
import { TelemetryApi } from '../../core/data/apis';
import { METRICS, MetricKey, PROFILE_VITALS } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { METRIC_HELP } from '../../shared/help';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { TipContent } from '../../shared/tooltip/tooltip.service';
import { MetricValue } from '../../shared/ui/metric-value';
import { Skeleton } from '../../shared/ui/skeleton';
import { Sparkline } from '../../shared/ui/sparkline';

const KEYS: MetricKey[] = [...PROFILE_VITALS, 'bpDia'];

/** Six live vital tiles with 24 h trend against the personal baseline. */
@Component({
  selector: 'nh-vitals-strip',
  imports: [RouterLink, MetricValue, Sparkline, Skeleton, TipDirective],
  template: `
    @if (tiles(); as tiles) {
      <ul class="strip">
        @for (v of tiles; track v.key) {
          <li>
            <a
              class="tile"
              [class.out]="v.out"
              [routerLink]="[]"
              [queryParams]="{ metric: crewId() + ':' + v.key }"
              queryParamsHandling="merge"
              [nhTip]="v.tip"
              [attr.aria-label]="v.aria"
            >
              <span class="k">
                {{ v.label }}
                @if ($first && clock.isLive()) {
                  <span class="live" aria-hidden="true"></span>
                }
              </span>
              <span class="v">
                <nh-metric-value [value]="v.value" [decimals]="v.decimals" />
                @if (v.value2 !== null) {
                  <span class="slash">/</span><nh-metric-value [value]="v.value2" [decimals]="0" />
                }
                <span class="u">{{ v.unit }}</span>
              </span>
              <span class="n">Normal {{ v.normal }}</span>
              <nh-sparkline class="spark" [samples]="v.samples" [baseline]="v.baseline" [width]="140" [height]="26" />
            </a>
          </li>
        }
      </ul>
    } @else {
      <div class="strip">
        @for (i of [0, 1, 2, 3, 4, 5]; track i) {
          <nh-skeleton h="128px" />
        }
      </div>
    }
  `,
  styles: `
    @use 'mixins' as *;
    .strip {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .tile {
      @include panel;
      @include focus-ring;
      display: grid;
      gap: var(--space-1);
      padding: var(--space-4);
      transition: border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
      &:hover {
        border-color: var(--line-strong);
        transform: translateY(-1px);
        .v {
          color: var(--accent);
        }
      }
      &.out .v nh-metric-value {
        color: var(--watch);
      }
    }
    .k {
      @include label;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .live {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--nominal);
      animation: pulse 2.4s var(--ease-in-out) infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
      }
    }
    .v {
      display: flex;
      align-items: baseline;
      gap: 3px;
      font-size: var(--type-h2);
      color: var(--text-1);
      transition: color var(--dur-fast) var(--ease-out);
    }
    .slash {
      color: var(--text-3);
    }
    .u {
      font-size: var(--type-caption);
      color: var(--text-3);
      margin-left: 2px;
    }
    .n {
      font-size: var(--type-micro);
      color: var(--text-3);
    }
    .spark {
      margin-top: var(--space-1);
      ::ng-deep svg {
        width: 100%;
      }
    }
    @include bp-tablet {
      .strip {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VitalsStrip {
  readonly crewId = input.required<string>();
  readonly ownerLabel = input('Normal');

  private readonly telemetry = inject(TelemetryApi);
  protected readonly clock = inject(MissionClock);

  private readonly id$ = toObservable(this.crewId);
  private readonly live = toSignal(this.id$.pipe(switchMap((id) => this.telemetry.live(id))));
  private readonly history = toSignal(
    combineLatest([this.id$, toObservable(this.clock.queryHour)]).pipe(
      switchMap(([id, hour]) =>
        combineLatest(
          KEYS.map((k) =>
            combineLatest([this.telemetry.series(id, k, hour - 24, hour), this.telemetry.baseline(id, k)]).pipe(
              map(([samples, baseline]) => ({ key: k, samples, baseline })),
            ),
          ),
        ),
      ),
    ),
  );

  protected readonly tiles = computed(() => {
    const h = this.history();
    if (!h) return null;
    const live = this.clock.isLive() ? this.live() : undefined;
    const by = new Map(h.map((x) => [x.key, x]));
    return PROFILE_VITALS.map((key) => {
      const def = METRICS[key];
      const row = by.get(key)!;
      const value = live?.values[key] ?? row.samples.at(-1)?.v ?? null;
      const dia = key === 'bpSys' ? (live?.values.bpDia ?? by.get('bpDia')?.samples.at(-1)?.v ?? null) : null;
      const b = row.baseline;
      const dec = def.decimals;
      const out = !!b && value !== null && ((value < b.low && def.concern !== 'high') || (value > b.high && def.concern !== 'low'));
      const normal = b ? `${b.low.toFixed(dec)}–${b.high.toFixed(dec)}` : '—';
      const vals = row.samples.map((s) => s.v);
      const tip: TipContent = {
        title: key === 'bpSys' ? 'Blood pressure' : def.label,
        body: METRIC_HELP[key],
        rows: [
          ...(value !== null ? [{ label: 'Now', value: `${value.toFixed(dec)}${dia !== null ? '/' + dia.toFixed(0) : ''} ${def.unit}`, tone: out ? ('watch' as const) : undefined }] : []),
          { label: this.ownerLabel(), value: `${normal} ${def.unit}` },
          ...(vals.length ? [{ label: 'Last 24 h', value: `${Math.min(...vals).toFixed(dec)}–${Math.max(...vals).toFixed(dec)} ${def.unit}` }] : []),
        ],
        hint: 'Click to open the full trend',
      };
      return {
        key,
        label: key === 'bpSys' ? 'BP' : def.short,
        unit: def.unit,
        decimals: dec,
        value,
        value2: dia,
        normal,
        samples: row.samples,
        baseline: b,
        out,
        tip,
        aria: `${def.label} ${value?.toFixed(dec) ?? 'no data'}${dia !== null ? ' over ' + dia.toFixed(0) : ''} ${def.unit}, normal ${normal}${out ? ', outside normal range' : ''}. Open detail.`,
      };
    });
  });
}
