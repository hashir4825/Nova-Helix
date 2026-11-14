import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, map, switchMap } from 'rxjs';
import { TelemetryApi } from '../../core/data/apis';
import { METRICS, MetricKey } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { formatMetric, formatMissionTime } from '../../core/util/format';
import { METRIC_HELP } from '../../shared/help';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Icon } from '../../shared/ui/icon';
import { ICON, STATUS_ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';

const TESTS: MetricKey[] = ['wbc', 'lymphocytes', 'boneMarker', 'visionAcuity', 'reactionTime'];

/** Periodic tests: latest results vs personal normal and clinical reference. */
@Component({
  selector: 'nh-medical-tests',
  imports: [Skeleton, TipDirective, RouterLink, Icon],
  template: `
    @if (rows(); as rows) {
      <div class="scroll">
        <table class="tests">
          <caption class="visually-hidden">Periodic medical tests</caption>
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Latest</th>
              <th scope="col">Previous</th>
              <th scope="col" tabindex="0" nhTip="This astronaut's own usual range, from early in the mission">Personal normal</th>
              <th scope="col" tabindex="0" nhTip="Standard clinical range for healthy adults on Earth">Reference</th>
              <th scope="col"><span class="visually-hidden">Open</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows; track r.key) {
              <tr [class.flag]="r.flag">
                <th scope="row">
                  <span class="name" tabindex="0" [nhTip]="{ title: r.label, body: r.help, rows: [{ label: 'Measured by', value: r.source }, { label: 'How often', value: r.cadence }] }">{{ r.label }}</span>
                </th>
                <td>
                  @if (r.latest) {
                    <span class="v">
                      @if (r.flag) {
                        <nh-icon [icon]="watchIcon" [size]="13" [stroke]="2" label="Outside normal" />
                      }
                      {{ r.latest.v }}
                    </span>
                    <span class="when">{{ r.latest.when }}</span>
                  }
                </td>
                <td>
                  @if (r.prev) {
                    <span class="v dim">{{ r.prev.v }}</span>
                    <span class="when">{{ r.prev.when }}</span>
                  }
                </td>
                <td class="mono">{{ r.normal }}</td>
                <td class="mono dim">{{ r.reference }}</td>
                <td>
                  <a
                    class="open"
                    [routerLink]="[]"
                    [queryParams]="{ metric: crewId() + ':' + r.key }"
                    queryParamsHandling="merge"
                    [attr.aria-label]="'Open ' + r.label + ' trend'"
                    nhTip="Open full trend"
                  >
                    <nh-icon [icon]="icons.arrowUpRight" [size]="15" />
                  </a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <nh-skeleton h="240px" />
    }
  `,
  styles: `
    @use 'mixins' as *;
    .scroll {
      overflow-x: auto;
    }
    .tests {
      width: 100%;
      min-width: 560px;
      border-collapse: collapse;
      font-size: var(--type-caption);
    }
    th,
    td {
      text-align: left;
      padding: var(--space-3);
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }
    thead th {
      @include label;
    }
    .name {
      font-weight: var(--weight-medium);
      cursor: help;
      border-radius: var(--radius-1);
    }
    .v {
      @include mono;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--text-1);
      font-size: var(--type-body);
    }
    .flag .v:not(.dim) {
      color: var(--watch);
    }
    .when {
      display: block;
      font-size: var(--type-micro);
      color: var(--text-3);
    }
    .mono {
      @include mono;
    }
    .dim {
      color: var(--text-3);
    }
    .open {
      @include focus-ring;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      color: var(--text-3);
      &:hover {
        color: var(--accent);
        background: var(--accent-soft);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MedicalTests {
  readonly crewId = input.required<string>();
  private readonly telemetry = inject(TelemetryApi);
  private readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly watchIcon = STATUS_ICON.watch;

  private readonly data = toSignal(
    combineLatest([toObservable(this.crewId), toObservable(this.clock.queryHour)]).pipe(
      switchMap(([id, h]) =>
        combineLatest(
          TESTS.map((k) =>
            combineLatest([this.telemetry.series(id, k, 0, h), this.telemetry.baseline(id, k)]).pipe(map(([s, b]) => ({ key: k, s, b }))),
          ),
        ),
      ),
    ),
  );

  protected readonly rows = computed(() => {
    const d = this.data();
    if (!d) return null;
    return d.map(({ key, s, b }) => {
      const def = METRICS[key];
      const last = s.at(-1);
      const prev = s.at(-2);
      const f = (v: number) => formatMetric(key, v);
      const flag = !!last && !!b && ((last.v < b.low && def.concern !== 'high') || (last.v > b.high && def.concern !== 'low'));
      return {
        key,
        label: def.label,
        help: METRIC_HELP[key],
        source: def.source,
        cadence: def.cadence === 'monthly' ? 'Monthly' : 'Weekly',
        latest: last ? { v: f(last.v), when: formatMissionTime(last.t) } : null,
        prev: prev ? { v: f(prev.v), when: formatMissionTime(prev.t) } : null,
        normal: b ? `${formatMetric(key, b.low, false)}–${f(b.high)}` : '—',
        reference: def.reference ? `${formatMetric(key, def.reference[0], false)}–${f(def.reference[1])}` : '—',
        flag,
      };
    });
  });
}
