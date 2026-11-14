import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { QuestionOption } from '../../core/models';

let nextId = 0;

/**
 * Labelled 1–5 scale built on native radio inputs (arrow keys + screen readers for free).
 * `layout="row"` for the quick check-in, `"stack"` for one-question-at-a-time questionnaires.
 */
@Component({
  selector: 'nh-scale-picker',
  template: `
    <fieldset class="scale" [class]="'scale ' + layout()">
      <legend [class.visually-hidden]="hideLegend()">{{ legend() }}</legend>
      <div class="opts">
        @for (o of options(); track o.value) {
          <label class="opt" [class.on]="value() === o.value" [attr.data-v]="o.value">
            <input type="radio" [name]="group" [value]="o.value" [checked]="value() === o.value" (change)="value.set(o.value)" />
            <span class="bar" aria-hidden="true">
              @for (i of [1, 2, 3, 4, 5]; track i) {
                <span [class.fill]="i <= o.value"></span>
              }
            </span>
            <span class="txt">{{ o.label }}</span>
            @if (layout() === 'stack') {
              <span class="key" aria-hidden="true">{{ o.value }}</span>
            }
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    @use 'mixins' as *;
    .scale {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    legend {
      padding: 0;
      margin-bottom: var(--space-2);
      font-weight: var(--weight-semibold);
      font-size: var(--type-body);
    }
    .opts {
      display: grid;
      gap: var(--space-2);
    }
    .row .opts {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .opt {
      position: relative;
      display: grid;
      gap: var(--space-2);
      justify-items: center;
      align-content: center;
      min-height: 64px;
      padding: var(--space-2);
      border-radius: var(--radius-2);
      border: 1px solid var(--line);
      background: var(--surface-2);
      cursor: pointer;
      text-align: center;
      transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);

      &:hover {
        border-color: var(--line-strong);
      }
      &:active {
        transform: scale(0.98);
      }
      &.on {
        border-color: var(--crew);
        background: var(--crew-soft);
        .txt {
          color: var(--text-1);
          font-weight: var(--weight-semibold);
        }
      }
      &:has(input:focus-visible) {
        outline: var(--focus-ring);
        outline-offset: 2px;
      }
    }
    input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .bar {
      display: inline-flex;
      gap: 2px;
      align-items: flex-end;
      span {
        width: 4px;
        border-radius: 1px;
        background: var(--surface-3);
        &:nth-child(1) { height: 6px; }
        &:nth-child(2) { height: 9px; }
        &:nth-child(3) { height: 12px; }
        &:nth-child(4) { height: 15px; }
        &:nth-child(5) { height: 18px; }
        &.fill {
          background: var(--crew);
        }
      }
    }
    .txt {
      font-size: var(--type-caption);
      color: var(--text-2);
      line-height: var(--lh-tight);
    }
    .stack .opt {
      grid-template-columns: auto 1fr auto;
      justify-items: start;
      gap: var(--space-4);
      min-height: 56px;
      padding: 0 var(--space-4);
      text-align: left;
      .txt {
        font-size: var(--type-body-lg);
      }
    }
    .key {
      @include mono;
      font-size: var(--type-caption);
      color: var(--text-3);
      padding: 2px 8px;
      border-radius: var(--radius-1);
      border: 1px solid var(--line-strong);
    }
    @include bp-narrow {
      .row .opts {
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: var(--space-1);
      }
      .row .txt {
        font-size: var(--type-micro);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScalePicker {
  readonly legend = input.required<string>();
  readonly options = input.required<QuestionOption[]>();
  readonly layout = input<'row' | 'stack'>('row');
  readonly hideLegend = input(false);
  readonly value = model<number | null>(null);
  protected readonly group = `nh-scale-${nextId++}`;
}
