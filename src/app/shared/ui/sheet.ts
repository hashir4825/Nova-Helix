import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Icon } from './icon';
import { ICON } from './icons';
import { TipDirective } from '../tooltip/tip.directive';

let nextId = 0;

/**
 * Side sheet on a native modal <dialog>: focus trap, Esc to close, inert background
 * and focus restore come from the platform.
 */
@Component({
  selector: 'nh-sheet',
  imports: [Icon, TipDirective],
  template: `
    <dialog #dlg class="sheet" [attr.aria-labelledby]="labelId" (cancel)="onCancel($event)" (click)="onBackdrop($event)">
      <div class="panel">
        <header class="head">
          <div class="titles">
            <div class="eyebrow"><ng-content select="[sheetEyebrow]" /></div>
            <h2 class="title" [id]="labelId" tabindex="-1" autofocus>{{ heading() }}</h2>
          </div>
          <button type="button" class="close" (click)="closed.emit()" aria-label="Close" nhTip="Close (Esc)" nhTipPlacement="left">
            <nh-icon [icon]="icons.close" [size]="18" />
          </button>
        </header>
        <div class="body"><ng-content /></div>
      </div>
    </dialog>
  `,
  styles: `
    @use 'mixins' as *;
    .sheet {
      position: fixed;
      inset: 0 0 0 auto;
      margin: 0;
      padding: 0;
      width: min(var(--sheet-w), 100vw);
      max-width: 100vw;
      height: 100dvh;
      max-height: 100dvh;
      border: 0;
      border-left: 1px solid var(--line-strong);
      background: var(--surface-1);
      color: var(--text-1);
      box-shadow: var(--elev-3);
      animation: slide-in var(--dur-slow) var(--ease-out);
    }
    .sheet::backdrop {
      background: var(--scrim);
      backdrop-filter: blur(2px);
      animation: fade var(--dur-slow) var(--ease-out);
    }
    @keyframes slide-in {
      from {
        transform: translateX(32px);
        opacity: 0;
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .head {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-5) var(--space-5) var(--space-4);
      border-bottom: 1px solid var(--line);
    }
    .titles {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: var(--space-1);
    }
    .eyebrow {
      @include label;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .title {
      @include display;
      font-size: var(--type-h2);
      outline: none;
    }
    .close {
      @include reset-button;
      @include focus-ring;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      color: var(--text-2);
      background: var(--surface-2);
      &:hover {
        color: var(--text-1);
        background: var(--surface-3);
      }
    }
    .body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-5);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sheet implements OnDestroy {
  readonly heading = input.required<string>();
  readonly closed = output<void>();
  protected readonly icons = ICON;
  protected readonly labelId = `nh-sheet-${nextId++}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  /** Element that had focus when the sheet opened; focus returns here on close. */
  private readonly opener = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      const d = this.dlg().nativeElement;
      if (!d.open) d.showModal();
    });
  }

  protected onCancel(e: Event): void {
    e.preventDefault();
    this.closed.emit();
  }

  /** Clicks on the ::backdrop target the dialog element itself. */
  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.closed.emit();
  }

  ngOnDestroy(): void {
    const d = this.dlg().nativeElement;
    if (d.open) d.close();
    const o = this.opener;
    if (o && o !== document.body) {
      // After Angular removes the sheet, return focus to whatever opened it.
      setTimeout(() => {
        if (o.isConnected) o.focus({ preventScroll: true });
      });
    }
  }
}
