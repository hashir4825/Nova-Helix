import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../ui/icon';
import { ICON } from '../ui/icons';
import { TipDirective } from './tip.directive';
import { TipContent } from './tooltip.service';

/** Small "?" button that explains the section it sits in. Keyboard-focusable. */
@Component({
  selector: 'nh-help',
  imports: [Icon, TipDirective],
  template: `
    <button type="button" class="help" [nhTip]="tip()" nhTipPlacement="bottom" [attr.aria-label]="'About ' + (label() || 'this section')">
      <nh-icon [icon]="icons.help" [size]="14" />
    </button>
  `,
  styles: `
    @use 'mixins' as *;
    :host {
      display: inline-flex;
    }
    .help {
      @include reset-button;
      @include focus-ring;
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      color: var(--text-3);
      cursor: help;
      transition: color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
      &:hover {
        color: var(--accent);
        background: var(--accent-soft);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpHint {
  readonly tip = input.required<TipContent>();
  readonly label = input('');
  protected readonly icons = ICON;
}
