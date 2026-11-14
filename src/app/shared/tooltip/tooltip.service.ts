import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { Severity, Status } from '../../core/models';

export type TipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TipRow {
  label: string;
  value: string;
  tone?: Status | Severity;
}

/** Rich tooltip content. A plain string is treated as `{ body }`. */
export interface TipContent {
  title?: string;
  body?: string;
  rows?: TipRow[];
  /** What happens on click, e.g. "Click to open the trend". */
  hint?: string;
}

export interface TipState {
  owner: object;
  anchor: HTMLElement;
  content: TipContent;
  placement: TipPlacement;
}

export const TIP_ID = 'nh-tooltip';
const SHOW_DELAY = 320;
const HIDE_DELAY = 120;

/**
 * One tooltip for the whole app (WCAG 1.4.13: dismissible with Esc, hoverable, persistent).
 * Anchors get aria-describedby while the tip is visible.
 */
@Injectable({ providedIn: 'root' })
export class TooltipService {
  private readonly doc = inject(DOCUMENT);
  readonly state = signal<TipState | null>(null);
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private describedBefore: string | null = null;

  constructor() {
    this.doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state()) this.hideNow();
    });
    this.doc.addEventListener('scroll', () => this.state() && this.hideNow(), { capture: true, passive: true });
  }

  show(owner: object, anchor: HTMLElement, content: TipContent, placement: TipPlacement, immediate = false): void {
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    const open = () => {
      this.detach();
      this.describedBefore = anchor.getAttribute('aria-describedby');
      anchor.setAttribute('aria-describedby', [this.describedBefore, TIP_ID].filter(Boolean).join(' '));
      this.state.set({ owner, anchor, content, placement });
    };
    // Already showing another tip: switch instantly (no re-delay while scanning).
    if (immediate || this.state()) open();
    else this.showTimer = setTimeout(open, SHOW_DELAY);
  }

  hide(owner: object): void {
    clearTimeout(this.showTimer);
    if (this.state()?.owner !== owner) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hideNow(), HIDE_DELAY);
  }

  /** Pointer moved onto the tooltip itself: keep it. */
  hold(): void {
    clearTimeout(this.hideTimer);
  }

  release(): void {
    const s = this.state();
    if (s) this.hide(s.owner);
  }

  hideNow(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.detach();
    this.state.set(null);
  }

  /** Called when an anchor is destroyed. */
  forget(owner: object): void {
    clearTimeout(this.showTimer);
    if (this.state()?.owner === owner) this.hideNow();
  }

  private detach(): void {
    const s = this.state();
    if (!s) return;
    if (this.describedBefore) s.anchor.setAttribute('aria-describedby', this.describedBefore);
    else s.anchor.removeAttribute('aria-describedby');
    this.describedBefore = null;
  }
}
