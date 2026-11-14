import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Temporary placeholder for screens scheduled in later milestones. */
@Component({
  selector: 'nh-pending',
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <p class="label">{{ milestone() }} · Not yet built</p>
      <h1>{{ screen() }}</h1>
      <a routerLink="/" class="back">Return to Mission Control</a>
    </div>
  `,
  styles: `
    @use 'mixins' as *;
    .wrap {
      padding: var(--space-7) var(--page-pad);
      display: grid;
      gap: var(--space-3);
    }
    h1 {
      font-size: var(--type-h2);
      font-weight: var(--weight-medium);
    }
    .back {
      @include focus-ring;
      color: var(--accent);
      width: fit-content;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pending {
  readonly screen = input('');
  readonly milestone = input('');
}
