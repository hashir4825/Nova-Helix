import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { MissionApi } from '../../core/data/apis';
import { MissionClock } from '../../core/state/mission-clock';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Icon } from '../../shared/ui/icon';
import { ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';

const DAYS = 28;

/** Last 28 days of the exercise countermeasure: done, missed, or rest (EVA / storm days). */
@Component({
  selector: 'nh-exercise-calendar',
  imports: [Skeleton, TipDirective, Icon],
  template: `
    <article class="cal">
      <header class="head">
        <h4 tabindex="0" nhTip="Daily resistive and aerobic exercise is the main protection against bone and muscle loss in microgravity.">Exercise countermeasure</h4>
        @if (stats(); as s) {
          <span class="pct" [class.low]="s.pct < 80">{{ s.pct }}% done</span>
        }
      </header>
      @if (cells(); as cells) {
        <ol class="grid" aria-label="Exercise sessions, last 28 days">
          @for (c of cells; track c.day) {
            <li
              class="cell"
              [class]="'cell ' + c.state"
              tabindex="0"
              [nhTip]="'D' + c.day + ': ' + c.text"
              [attr.aria-label]="'Day ' + c.day + ', ' + c.text"
            >
              @if (c.state === 'done') {
                <nh-icon [icon]="icons.check" [size]="12" [stroke]="2.5" />
              } @else if (c.state === 'missed') {
                <nh-icon [icon]="icons.close" [size]="12" [stroke]="2.5" />
              }
            </li>
          }
        </ol>
        <p class="legend">
          <span><span class="sw done"></span>Done</span>
          <span><span class="sw missed"></span>Missed</span>
          <span><span class="sw rest"></span>Rest day (EVA / storm)</span>
        </p>
      } @else {
        <nh-skeleton h="120px" />
      }
    </article>
  `,
  styles: `
    @use 'mixins' as *;
    .cal {
      @include panel;
      padding: var(--space-4);
      display: grid;
      gap: var(--space-3);
      height: 100%;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      h4 {
        font-size: var(--type-body);
        font-weight: var(--weight-semibold);
        cursor: help;
        border-radius: var(--radius-1);
      }
    }
    .pct {
      @include mono;
      font-size: var(--type-caption);
      color: var(--nominal);
      &.low {
        color: var(--watch);
      }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(14, minmax(0, 1fr));
      gap: 4px;
    }
    .cell {
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      border-radius: var(--radius-1);
      background: var(--surface-2);
      color: var(--text-3);
      cursor: help;
      &.done {
        background: var(--nominal-soft);
        color: var(--nominal);
      }
      &.missed {
        background: var(--watch-soft);
        color: var(--watch);
        box-shadow: inset 0 0 0 1px var(--watch);
      }
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      font-size: var(--type-micro);
      color: var(--text-3);
      span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
    }
    .sw {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      &.done {
        background: var(--nominal);
      }
      &.missed {
        background: var(--watch);
      }
      &.rest {
        background: var(--surface-3);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExerciseCalendar {
  readonly crewId = input.required<string>();
  private readonly mission = inject(MissionApi);
  private readonly clock = inject(MissionClock);
  protected readonly icons = ICON;

  private readonly events = toSignal(
    combineLatest([toObservable(this.crewId), toObservable(this.clock.queryHour)]).pipe(
      switchMap(([id, h]) => this.mission.timeline(id, h - DAYS * 24, h)),
    ),
  );

  protected readonly cells = computed(() => {
    const ev = this.events();
    if (!ev) return null;
    const today = this.clock.day();
    const ex = new Map(ev.filter((e) => e.kind === 'exercise').map((e) => [Math.floor(e.start / 24) + 1, e]));
    return Array.from({ length: DAYS }, (_, i) => today - DAYS + 1 + i).map((day) => {
      const e = ex.get(day);
      const state = !e ? 'rest' : e.missed ? 'missed' : 'done';
      const text = state === 'done' ? 'session done' : state === 'missed' ? 'session missed' : day === today ? 'not yet done today' : 'no session scheduled';
      return { day, state: !e && day === today ? 'rest' : state, text };
    });
  });

  protected readonly stats = computed(() => {
    const c = this.cells();
    if (!c) return null;
    const scheduled = c.filter((x) => x.state !== 'rest').length;
    const done = c.filter((x) => x.state === 'done').length;
    return { pct: scheduled ? Math.round((done / scheduled) * 100) : 100 };
  });
}
