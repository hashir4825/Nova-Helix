import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { MobilityApi } from '../../../core/data/apis';
import { MobilityTestResult } from '../../../core/models';
import { MissionClock } from '../../../core/state/mission-clock';
import { TipDirective } from '../../../shared/tooltip/tip.directive';
import { Icon } from '../../../shared/ui/icon';
import { ICON } from '../../../shared/ui/icons';
import { Skeleton } from '../../../shared/ui/skeleton';
import { StatusBadge } from '../../../shared/ui/status-badge';

/** A check stays current this many days; after that My health asks for a new one. */
export const MOBILITY_VALID_DAYS = 7;

/** Last mobility check on My health, with a prompt when it is missing or out of date. */
@Component({
  selector: 'nh-mobility-summary',
  imports: [RouterLink, Icon, StatusBadge, Skeleton, TipDirective],
  template: `
    <section class="card" [class.due]="due()" aria-labelledby="mob-sum-h">
      <header class="head">
        <h2 id="mob-sum-h"><nh-icon [icon]="icons.camera" [size]="18" />Mobility &amp; balance check</h2>
        @if (latest(); as r) {
          <nh-status [status]="r.status" />
        }
      </header>

      @if (history() === undefined) {
        <nh-skeleton h="96px" />
      } @else if (latest(); as r) {
        <p class="when">
          Last check <span class="mono">D{{ r.lastCheckDay }}</span>
          @if (due()) {
            · <strong class="expired">out of date</strong> (checks are valid for {{ validDays }} days)
          } @else {
            · valid until <span class="mono">D{{ r.lastCheckDay + validDays }}</span>
          }
        </p>
        <ul class="tests">
          @for (t of r.tests; track t.test) {
            <li tabindex="0" [nhTip]="{ title: t.label, body: t.note }">
              <span class="t-label">{{ t.label }}</span>
              <span class="t-val mono">{{ value(t) }}</span>
              <nh-status [status]="t.status" variant="plain" />
            </li>
          }
        </ul>
      } @else {
        <p class="when">No check yet. It takes about 2 minutes with the camera and shows how your balance and leg strength are holding up.</p>
      }

      <div class="foot">
        @if (due()) {
          <a class="go" routerLink="/mobility"><nh-icon [icon]="icons.camera" [size]="16" />{{ latest() ? 'Take a new check' : 'Take your first check' }}</a>
          <span class="hint">About 2 min · video stays on this device</span>
        } @else {
          <a class="again" routerLink="/mobility">Open mobility check <nh-icon [icon]="icons.chevronRight" [size]="14" /></a>
        }
      </div>
    </section>
  `,
  styles: `
    @use 'mixins' as *;
    .card {
      @include panel;
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
      &.due {
        border-color: color-mix(in srgb, var(--crew) 55%, transparent);
        background: linear-gradient(135deg, var(--crew-soft), transparent 65%), var(--surface-1);
      }
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      h2 {
        @include display;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--type-title);
        nh-icon {
          color: var(--crew);
        }
      }
    }
    .when {
      color: var(--text-2);
      font-size: var(--type-caption);
    }
    .expired {
      color: var(--watch);
    }
    .tests {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
      li {
        @include focus-ring;
        display: grid;
        gap: 2px;
        padding: var(--space-3);
        border-radius: var(--radius-2);
        background: var(--surface-2);
      }
    }
    .t-label {
      font-size: var(--type-caption);
      color: var(--text-2);
    }
    .t-val {
      font-size: var(--type-title);
    }
    .mono {
      @include mono;
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-4);
    }
    .go {
      @include focus-ring;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      height: 44px;
      padding: 0 var(--space-5);
      border-radius: var(--radius-round);
      background: var(--crew);
      color: var(--crew-ink);
      font-weight: var(--weight-semibold);
      text-decoration: none;
    }
    .again {
      @include focus-ring;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--crew);
      font-size: var(--type-caption);
      font-weight: var(--weight-semibold);
      text-decoration: none;
      border-radius: var(--radius-1);
    }
    .hint {
      color: var(--text-3);
      font-size: var(--type-micro);
    }
    @include bp-narrow {
      .tests {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobilitySummary {
  readonly crewId = input.required<string>();
  protected readonly icons = ICON;
  protected readonly validDays = MOBILITY_VALID_DAYS;
  private readonly clock = inject(MissionClock);
  private readonly api = inject(MobilityApi);

  protected readonly history = toSignal(toObservable(this.crewId).pipe(switchMap((id) => this.api.history(id))));
  protected readonly latest = computed(() => this.history()?.latest ?? null);
  /** No check yet, or the last one is MOBILITY_VALID_DAYS or more days old. */
  protected readonly due = computed(() => {
    if (this.history() === undefined) return false;
    const r = this.latest();
    return !r || this.clock.day() - r.lastCheckDay >= MOBILITY_VALID_DAYS;
  });

  protected value(t: MobilityTestResult): string {
    const [k, v] = Object.entries(t.values)[0] ?? ['', 0];
    return /deg$/i.test(k) ? `${v.toFixed(0)}°` : `${v.toFixed(1)} s`;
  }
}
