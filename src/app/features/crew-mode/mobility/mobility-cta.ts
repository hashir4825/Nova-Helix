import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { MobilityApi } from '../../../core/data/apis';
import { TipDirective } from '../../../shared/tooltip/tip.directive';
import { Icon } from '../../../shared/ui/icon';
import { ICON } from '../../../shared/ui/icons';
import { StatusBadge } from '../../../shared/ui/status-badge';

/** Prominent entry to the camera mobility check (Crew Mode home and Check-in). */
@Component({
  selector: 'nh-mobility-cta',
  imports: [RouterLink, Icon, StatusBadge, TipDirective],
  template: `
    <section class="cta" aria-labelledby="mob-cta-h">
      <a class="viewfinder" routerLink="/mobility" tabindex="-1" aria-hidden="true">
        <svg viewBox="0 0 160 160" class="figure">
          <!-- corner brackets -->
          <path class="bracket" d="M14 40V14h26M120 14h26v26M146 120v26h-26M40 146H14v-26" />
          <!-- single-leg balance pose: bones -->
          <path class="bone" d="M80 44L80 84M80 54L62 70L72 84M80 54L98 70L88 84M80 84L74 112L74 140M80 84L92 104L104 98" />
          <!-- keypoints -->
          <circle class="head" cx="80" cy="34" r="9" />
          <g class="joint">
            <circle cx="80" cy="54" r="3.5" /><circle cx="62" cy="70" r="3.5" /><circle cx="98" cy="70" r="3.5" />
            <circle cx="80" cy="84" r="3.5" /><circle cx="74" cy="112" r="3.5" /><circle cx="74" cy="140" r="3.5" />
            <circle cx="92" cy="104" r="3.5" /><circle cx="104" cy="98" r="3.5" />
          </g>
          <path class="scan" d="M24 92H136" />
        </svg>
      </a>

      <div class="body">
        <p class="eyebrow"><nh-icon [icon]="icons.camera" [size]="14" />Camera check · Gravity</p>
        <h2 id="mob-cta-h">Mobility &amp; balance check</h2>
        <p class="lede">The camera tracks your body on this device and measures balance, leg strength and knee bend. Weightlessness weakens all three; a weekly check catches a decline early.</p>
        <ul class="tests" aria-label="The three tests">
          <li>Single-leg balance</li>
          <li>5× sit-to-stand</li>
          <li>3 squats</li>
        </ul>
        <div class="row">
          <a class="go" routerLink="/mobility"><nh-icon [icon]="icons.camera" [size]="18" />Start check</a>
          <span class="meta">About 2 min · need a chair</span>
          @if (history()?.latest; as last) {
            <span class="last" tabindex="0" nhTip="Your most recent counted check">Last D{{ last.lastCheckDay }} <nh-status [status]="last.status" variant="plain" /></span>
          } @else if (history()) {
            <span class="last">Not done yet</span>
          }
        </div>
        <p class="privacy"><nh-icon [icon]="icons.lock" [size]="13" />Video stays on this device. Only five numbers are shared with Mission Control.</p>
      </div>
    </section>
  `,
  styles: `
    @use 'mixins' as *;
    :host {
      display: block;
      container-type: inline-size;
    }
    .cta {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      gap: var(--space-6);
      align-items: center;
      padding: var(--space-5) var(--space-6);
      border-radius: var(--radius-3);
      background: linear-gradient(135deg, var(--crew-soft), transparent 70%), var(--surface-1);
      border: 1px solid color-mix(in srgb, var(--crew) 45%, transparent);
      box-shadow: var(--elev-1);
    }
    .viewfinder {
      display: block;
      aspect-ratio: 1;
      border-radius: var(--radius-2);
      background: var(--surface-0);
      border: 1px solid var(--line);
    }
    .figure {
      width: 100%;
      height: 100%;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .bracket {
      stroke: var(--text-3);
      stroke-width: 2;
    }
    .bone {
      stroke: var(--crew);
      stroke-width: 4;
    }
    .head {
      stroke: var(--crew);
      stroke-width: 3;
    }
    .joint circle {
      fill: var(--text-1);
    }
    .scan {
      stroke: var(--crew);
      stroke-width: 1.5;
      stroke-dasharray: 3 5;
      opacity: 0.7;
      animation: scan 3.2s var(--ease-in-out) infinite alternate;
    }
    @keyframes scan {
      from {
        transform: translateY(-50px);
      }
      to {
        transform: translateY(46px);
      }
    }
    .body {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }
    .eyebrow {
      @include label;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--crew);
    }
    h2 {
      @include display;
      font-size: var(--type-h2);
      font-weight: var(--weight-semibold);
      letter-spacing: -0.02em;
    }
    .lede {
      color: var(--text-2);
      max-width: 66ch;
    }
    .tests {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        padding: 4px var(--space-3);
        border-radius: var(--radius-round);
        background: var(--surface-2);
        font-size: var(--type-caption);
      }
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3) var(--space-4);
      margin-top: var(--space-1);
    }
    .go {
      @include focus-ring;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      height: 48px;
      padding: 0 var(--space-6);
      border-radius: var(--radius-round);
      background: var(--crew);
      color: var(--crew-ink);
      font-weight: var(--weight-semibold);
      text-decoration: none;
      box-shadow: 0 8px 22px -10px var(--crew);
      transition: transform var(--dur-fast) var(--ease-out);
      &:hover {
        transform: translateY(-1px);
      }
    }
    .meta,
    .last {
      color: var(--text-2);
      font-size: var(--type-caption);
    }
    .last {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      border-radius: var(--radius-1);
      @include focus-ring;
    }
    .privacy {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-3);
      font-size: var(--type-micro);
    }
    @container (max-width: 560px) {
      .cta {
        grid-template-columns: minmax(0, 1fr);
        padding: var(--space-5);
      }
      .viewfinder {
        width: 120px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .scan {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobilityCta {
  readonly crewId = input.required<string>();
  protected readonly icons = ICON;
  private readonly api = inject(MobilityApi);
  protected readonly history = toSignal(toObservable(this.crewId).pipe(switchMap((id) => this.api.history(id))));
}
