import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { TelemetryApi } from '../../core/data/apis';
import { SYMPTOM_LABEL } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { ClockPipe } from '../../shared/pipes';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Skeleton } from '../../shared/ui/skeleton';

const SCALE = ['', 'Very low', 'Low', 'OK', 'Good', 'Very good'];

/** Last 14 days of daily check-ins, including missed days. */
@Component({
  selector: 'nh-checkin-history',
  imports: [ClockPipe, Skeleton, TipDirective],
  template: `
    @if (rows(); as rows) {
      <table class="ci">
        <caption class="visually-hidden">Daily check-ins, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col" nhTip="Self-rated mood (1 very low – 5 very good)" tabindex="0">Mood</th>
            <th scope="col" nhTip="Self-rated sleep quality last night" tabindex="0">Sleep</th>
            <th scope="col" nhTip="Self-rated energy" tabindex="0">Energy</th>
            <th scope="col">Symptoms &amp; note</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows; track r.day) {
            <tr [class.missed]="!r.ci">
              <th scope="row">
                <span class="d">D{{ r.day }}</span>
                @if (r.ci) {
                  <span class="t">{{ r.ci.at | clock }}</span>
                }
              </th>
              @if (r.ci; as c) {
                @for (v of [c.mood, c.sleepQuality, c.energy]; track $index) {
                  <td>
                    <span class="dots" [attr.aria-label]="v + ' of 5, ' + scale[v]" [class.low]="v <= 2">
                      @for (i of [1, 2, 3, 4, 5]; track i) {
                        <span class="dot" [class.on]="i <= v"></span>
                      }
                    </span>
                  </td>
                }
                <td class="sym">
                  @for (s of c.symptoms; track s) {
                    <span class="chip">{{ symptomLabel[s] }}</span>
                  }
                  @if (c.note) {
                    <span class="note">“{{ c.note }}”</span>
                  }
                  @if (!c.symptoms.length && !c.note) {
                    <span class="none">None</span>
                  }
                </td>
              } @else {
                <td colspan="4" class="miss">
                  {{ r.day === today() ? 'Not done yet today' : 'No check-in' }}
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <nh-skeleton h="320px" />
    }
  `,
  styles: `
    @use 'mixins' as *;
    .ci {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--type-caption);
    }
    th,
    td {
      text-align: left;
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }
    thead th {
      @include label;
      cursor: default;
    }
    tbody th {
      white-space: nowrap;
      font-weight: var(--weight-medium);
      .d {
        @include mono;
        color: var(--text-1);
      }
      .t {
        @include mono;
        margin-left: var(--space-2);
        color: var(--text-3);
      }
    }
    .dots {
      display: inline-flex;
      gap: 3px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--surface-3);
      &.on {
        background: var(--accent);
      }
    }
    .low .dot.on {
      background: var(--watch);
    }
    .sym {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      align-items: center;
    }
    .chip {
      padding: 2px 8px;
      border-radius: var(--radius-round);
      background: var(--watch-soft);
      color: var(--watch);
      font-weight: var(--weight-medium);
    }
    .note {
      color: var(--text-2);
      font-style: italic;
    }
    .none {
      color: var(--text-3);
    }
    .missed .miss {
      color: var(--watch);
      font-weight: var(--weight-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckinHistory {
  readonly crewId = input.required<string>();
  private readonly telemetry = inject(TelemetryApi);
  private readonly clock = inject(MissionClock);
  protected readonly symptomLabel = SYMPTOM_LABEL;
  protected readonly scale = SCALE;
  protected readonly today = this.clock.day;

  private readonly list = toSignal(
    combineLatest([toObservable(this.crewId), toObservable(this.clock.queryHour)]).pipe(
      switchMap(([id, h]) => this.telemetry.checkIns(id, h - 14 * 24, h)),
    ),
  );

  protected readonly rows = computed(() => {
    const l = this.list();
    if (!l) return null;
    const today = this.clock.day();
    const byDay = new Map(l.map((c) => [c.day, c]));
    return Array.from({ length: 14 }, (_, i) => today - i)
      .filter((d) => d >= 1)
      .map((day) => ({ day, ci: byDay.get(day) }));
  });
}
