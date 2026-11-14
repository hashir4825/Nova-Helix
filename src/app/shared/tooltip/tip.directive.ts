import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';
import { TipContent, TipPlacement, TooltipService } from './tooltip.service';

/**
 * Attach a tooltip: `[nhTip]="'Plain text'"` or `[nhTip]="{ title, body, rows, hint }"`.
 * Shows on hover (short delay) and on keyboard focus (immediately).
 */
@Directive({
  selector: '[nhTip]',
  host: {
    '(mouseenter)': 'enter()',
    '(mouseleave)': 'leave()',
    '(focusin)': 'focus()',
    '(focusout)': 'leave()',
    '(click)': 'svc.hideNow()',
  },
})
export class TipDirective implements OnDestroy {
  readonly nhTip = input<string | TipContent | null | undefined>(null);
  readonly nhTipPlacement = input<TipPlacement>('top');

  protected readonly svc = inject(TooltipService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  private content(): TipContent | null {
    const c = this.nhTip();
    if (!c) return null;
    return typeof c === 'string' ? { body: c } : c;
  }

  protected enter(): void {
    const c = this.content();
    if (c) this.svc.show(this, this.el.nativeElement, c, this.nhTipPlacement());
  }

  protected focus(): void {
    const c = this.content();
    const el = this.el.nativeElement;
    const target = el.ownerDocument.activeElement;
    // Only keyboard focus (not mouse clicks) opens instantly.
    if (c && target instanceof Element && target.matches(':focus-visible')) {
      this.svc.show(this, el, c, this.nhTipPlacement(), true);
    }
  }

  protected leave(): void {
    this.svc.hide(this);
  }

  ngOnDestroy(): void {
    this.svc.forget(this);
  }
}
