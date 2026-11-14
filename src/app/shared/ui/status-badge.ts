import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SEVERITY_LABEL, STATUS_LABEL, Severity, Status } from '../../core/models';
import { Icon } from './icon';
import { STATUS_ICON } from './icons';

/** Status as color + icon + text. Never color alone. */
@Component({
  selector: 'nh-status',
  imports: [Icon],
  template: `
    <span class="badge" [class]="'badge s-' + status() + ' v-' + variant()">
      <nh-icon [icon]="icon()" [size]="size() === 'lg' ? 16 : 14" [stroke]="1.75" />
      <span class="txt">{{ text() }}</span>
    </span>
  `,
  styles: `
    @use 'mixins' as *;
    :host {
      display: inline-flex;
    }
    .badge {
      @include label;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      height: 22px;
      padding: 0 var(--space-2) 0 6px;
      border-radius: var(--radius-1);
      font-weight: var(--weight-semibold);
      color: var(--c);
      background: var(--bg-s);
      white-space: nowrap;
    }
    .v-plain {
      background: none;
      padding: 0;
      height: auto;
    }
    .s-nominal { --c: var(--nominal); --bg-s: var(--nominal-soft); }
    .s-watch { --c: var(--watch); --bg-s: var(--watch-soft); }
    .s-alert { --c: var(--alert); --bg-s: var(--alert-soft); }
    .s-info { --c: var(--info); --bg-s: var(--info-soft); }
    :host([size='lg']) .badge {
      height: 28px;
      font-size: var(--type-caption);
      padding: 0 var(--space-3) 0 var(--space-2);
    }
  `,
  host: { '[attr.size]': 'size()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly status = input.required<Status | Severity>();
  readonly variant = input<'soft' | 'plain'>('soft');
  readonly size = input<'md' | 'lg'>('md');
  readonly label = input<string | undefined>(undefined);

  protected readonly icon = computed(() => STATUS_ICON[this.status()]);
  protected readonly text = computed(() => {
    const s = this.status();
    return this.label() ?? (s === 'info' ? SEVERITY_LABEL.info : STATUS_LABEL[s as Status] ?? SEVERITY_LABEL[s as Severity]);
  });
}
