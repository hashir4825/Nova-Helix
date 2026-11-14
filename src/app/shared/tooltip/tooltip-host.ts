import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { Icon } from '../ui/icon';
import { ICON, STATUS_ICON } from '../ui/icons';
import { TIP_ID, TipPlacement, TooltipService } from './tooltip.service';

const GAP = 10;
const EDGE = 8;

/** Renders the single app-wide tooltip next to its anchor, flipping to stay on screen. */
@Component({
  selector: 'nh-tooltip-host',
  imports: [Icon],
  template: `
    @if (svc.state(); as s) {
      <div
        #tip
        class="tip"
        popover="manual"
        [id]="tipId"
        role="tooltip"
        [class.ready]="pos().ready"
        [attr.data-side]="pos().side"
        [style.left.px]="pos().x"
        [style.top.px]="pos().y"
        (mouseenter)="svc.hold()"
        (mouseleave)="svc.release()"
      >
        @if (s.content.title) {
          <p class="title">{{ s.content.title }}</p>
        }
        @if (s.content.body) {
          <p class="body">{{ s.content.body }}</p>
        }
        @if (s.content.rows?.length) {
          <dl class="rows">
            @for (r of s.content.rows; track $index) {
              <div class="row">
                <dt>{{ r.label }}</dt>
                <dd [class]="r.tone ? 'tone-' + r.tone : ''">
                  @if (r.tone && r.tone !== 'nominal') {
                    <nh-icon [icon]="statusIcon[r.tone]" [size]="12" [stroke]="2" />
                  }
                  {{ r.value }}
                </dd>
              </div>
            }
          </dl>
        }
        @if (s.content.hint) {
          <p class="hint"><nh-icon [icon]="icons.pointer" [size]="12" />{{ s.content.hint }}</p>
        }
      </div>
    }
  `,
  styles: `
    @use 'mixins' as *;
    .tip {
      position: fixed;
      inset: auto;
      margin: 0;
      overflow: visible;
      z-index: var(--z-toast);
      max-width: 300px;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-2);
      background: var(--surface-3);
      border: 1px solid var(--line-strong);
      box-shadow: var(--elev-2);
      color: var(--text-1);
      font-size: var(--type-caption);
      line-height: var(--lh-body);
      opacity: 0;
      transform: translateY(var(--dy, 4px));
      transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
      pointer-events: auto;
    }
    .tip[data-side='bottom'] { --dy: -4px; }
    .tip[data-side='left'], .tip[data-side='right'] { --dy: 0; }
    .tip.ready {
      opacity: 1;
      transform: none;
    }
    .title {
      font-weight: var(--weight-semibold);
      font-size: var(--type-body);
      margin-bottom: 2px;
    }
    .body {
      color: var(--text-2);
    }
    .rows {
      display: grid;
      gap: 3px;
      margin: var(--space-2) 0 0;
      padding-top: var(--space-2);
      border-top: 1px solid var(--line-strong);
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
    }
    dt {
      color: var(--text-2);
    }
    dd {
      @include mono;
      margin: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--text-1);
      text-align: right;
      white-space: nowrap;
    }
    .tone-watch { color: var(--watch); }
    .tone-alert { color: var(--alert); }
    .tone-nominal { color: var(--nominal); }
    .hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: var(--space-2);
      color: var(--accent);
      font-weight: var(--weight-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TooltipHost {
  protected readonly svc = inject(TooltipService);
  protected readonly icons = ICON;
  protected readonly statusIcon = STATUS_ICON;
  protected readonly tipId = TIP_ID;
  private readonly tip = viewChild<ElementRef<HTMLElement>>('tip');
  protected readonly pos = signal<{ x: number; y: number; side: TipPlacement; ready: boolean }>({
    x: -9999,
    y: -9999,
    side: 'top',
    ready: false,
  });

  constructor() {
    effect(() => {
      const s = this.svc.state();
      const tipRef = this.tip();
      this.pos.set({ x: -9999, y: -9999, side: 'top', ready: false });
      if (!s || !tipRef) return;
      const el = tipRef.nativeElement;
      // Top layer, so tips also appear above modal sheets and dialogs.
      if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
        try {
          el.showPopover();
        } catch {
          /* already open or unsupported */
        }
      }
      requestAnimationFrame(() => this.place(s.anchor, el, s.placement));
    });
  }

  private place(anchor: HTMLElement, tip: HTMLElement, preferred: TipPlacement): void {
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fits: Record<TipPlacement, boolean> = {
      top: a.top - t.height - GAP >= EDGE,
      bottom: a.bottom + t.height + GAP <= vh - EDGE,
      left: a.left - t.width - GAP >= EDGE,
      right: a.right + t.width + GAP <= vw - EDGE,
    };
    const opposite: Record<TipPlacement, TipPlacement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    const side = fits[preferred] ? preferred : fits[opposite[preferred]] ? opposite[preferred] : 'bottom';
    let x: number;
    let y: number;
    if (side === 'top' || side === 'bottom') {
      x = a.left + a.width / 2 - t.width / 2;
      y = side === 'top' ? a.top - t.height - GAP : a.bottom + GAP;
    } else {
      y = a.top + a.height / 2 - t.height / 2;
      x = side === 'left' ? a.left - t.width - GAP : a.right + GAP;
    }
    x = Math.min(Math.max(EDGE, x), vw - t.width - EDGE);
    y = Math.min(Math.max(EDGE, y), vh - t.height - EDGE);
    this.pos.set({ x, y, side, ready: true });
  }
}
