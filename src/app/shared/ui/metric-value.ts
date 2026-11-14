import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Telemetry number in Plex Mono with a short tween between values. */
@Component({
  selector: 'nh-metric-value',
  template: `{{ display() }}`,
  styles: `
    :host {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums slashed-zero;
      font-feature-settings: 'tnum' 1, 'zero' 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricValue {
  readonly value = input<number | null | undefined>(null);
  readonly decimals = input(0);
  readonly duration = input(480);

  protected readonly display = signal('—');
  private current: number | null = null;
  private raf = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.raf));
    effect(() => {
      const target = this.value();
      const dec = this.decimals();
      untracked(() => this.animate(target, dec));
    });
  }

  private animate(target: number | null | undefined, dec: number): void {
    cancelAnimationFrame(this.raf);
    if (target === null || target === undefined || !Number.isFinite(target)) {
      this.current = null;
      this.display.set('—');
      return;
    }
    const from = this.current;
    if (from === null || REDUCED || this.duration() <= 0) {
      this.current = target;
      this.display.set(target.toFixed(dec));
      return;
    }
    const start = performance.now();
    const dur = this.duration();
    const step = (now: number) => {
      // rAF timestamps can precede `start`; clamp so the easing never extrapolates.
      const p = Math.min(1, Math.max(0, (now - start) / dur));
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      this.current = v;
      this.display.set(v.toFixed(dec));
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}
