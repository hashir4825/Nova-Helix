import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/** Card-like region with a quiet header, optional meta + actions slots. */
@Component({
  selector: 'nh-panel',
  template: `
    <header class="head">
      <h2 class="title" [id]="headingId">{{ heading() }}</h2>
      <div class="meta"><ng-content select="[panelMeta]" /></div>
      <div class="actions"><ng-content select="[panelActions]" /></div>
    </header>
    <div class="body" [class.flush]="flush()"><ng-content /></div>
  `,
  styles: `
    @use 'mixins' as *;
    :host {
      @include panel;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .head {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
      padding: var(--space-5) var(--space-5) var(--space-3);
    }
    .title {
      @include display;
      font-size: var(--type-body-lg);
      font-weight: var(--weight-medium);
      color: var(--text-1);
      white-space: nowrap;
    }
    .meta {
      flex: 1;
      min-width: 0;
      font-size: var(--type-caption);
      color: var(--text-3);
      @include truncate;
    }
    .actions {
      display: flex;
      gap: var(--space-2);
      align-items: center;
    }
    .body {
      padding: 0 var(--space-4) var(--space-4);
      min-height: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .body.flush {
      padding: 0;
    }
  `,
  host: { role: 'region', '[attr.aria-labelledby]': 'headingId' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Panel {
  readonly heading = input.required<string>();
  readonly flush = input(false);
  protected readonly headingId = `nh-panel-${nextId++}`;
}
