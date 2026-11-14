import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Loading placeholder. Shape-matched to the content it stands in for. */
@Component({
  selector: 'nh-skeleton',
  template: '',
  styles: `
    :host {
      display: block;
      background: var(--surface-2);
      border-radius: var(--radius-1);
      position: relative;
      overflow: hidden;
    }
    :host::after {
      content: '';
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, var(--surface-3), transparent);
      animation: shimmer 1.6s var(--ease-in-out) infinite;
    }
    @keyframes shimmer {
      to {
        transform: translateX(100%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host::after {
        display: none;
      }
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'w()',
    '[style.height]': 'h()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  readonly w = input('100%');
  readonly h = input('12px');
}
