import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HAZARDS, HazardKey } from '../../core/models';
import { Icon } from './icon';
import { HAZARD_ICON } from './icons';

/** Compact hazard chip: icon + 3-letter code; full name for AT and tooltip. */
@Component({
  selector: 'nh-hazard-tag',
  imports: [Icon],
  template: `
    <nh-icon [icon]="icon()" [size]="12" [stroke]="1.75" />
    <span aria-hidden="true">{{ def().short }}</span>
    <span class="visually-hidden">{{ def().label }}</span>
  `,
  styles: `
    @use 'mixins' as *;
    :host {
      @include label;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      height: 18px;
      padding: 0 5px;
      border: 1px solid var(--line);
      border-radius: var(--radius-1);
      color: var(--text-2);
      font-size: 10px;
    }
  `,
  host: { '[attr.title]': 'def().label' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HazardTag {
  readonly hazard = input.required<HazardKey>();
  protected readonly def = computed(() => HAZARDS[this.hazard()]);
  protected readonly icon = computed(() => HAZARD_ICON[this.hazard()]);
}
