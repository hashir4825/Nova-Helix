import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Baseline, Sample } from '../../core/models';

/**
 * Tiny trend line with the astronaut's personal baseline band.
 * Decorative unless `label` is supplied (the adjacent number carries the value).
 */
@Component({
  selector: 'nh-sparkline',
  template: `
    @let g = geometry();
    <svg
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      [attr.width]="width()"
      [attr.height]="height()"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() ?? null"
      [attr.aria-hidden]="label() ? null : 'true'"
      preserveAspectRatio="none"
    >
      @if (g.band) {
        <rect class="band" x="0" [attr.y]="g.band.y" [attr.width]="width()" [attr.height]="g.band.h" />
        <line class="mean" x1="0" [attr.x2]="width()" [attr.y1]="g.band.mean" [attr.y2]="g.band.mean" />
      }
      @if (g.path) {
        <path class="line" [attr.d]="g.path" />
        <circle class="dot" [attr.cx]="g.last.x" [attr.cy]="g.last.y" r="2" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      line-height: 0;
    }
    svg {
      overflow: visible;
      display: block;
    }
    .band {
      fill: var(--baseline-band);
    }
    .mean {
      stroke: var(--baseline-line);
      stroke-width: 1;
      stroke-dasharray: 2 3;
      vector-effect: non-scaling-stroke;
    }
    .line {
      fill: none;
      stroke: var(--series-1);
      stroke-width: 1.25;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
    .dot {
      fill: var(--accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sparkline {
  readonly samples = input<Sample[]>([]);
  readonly baseline = input<Baseline | null>(null);
  readonly width = input(112);
  readonly height = input(28);
  readonly label = input<string | undefined>(undefined);

  protected readonly geometry = computed(() => {
    const s = this.samples();
    const b = this.baseline();
    const w = this.width();
    const h = this.height();
    const empty = { path: '', last: { x: 0, y: 0 }, band: null as null | { y: number; h: number; mean: number } };
    if (s.length < 2) return empty;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of s) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    if (b) {
      lo = Math.min(lo, b.low);
      hi = Math.max(hi, b.high);
    }
    const pad = (hi - lo) * 0.12 || 1;
    lo -= pad;
    hi += pad;
    const t0 = s[0].t;
    const t1 = s[s.length - 1].t;
    const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * w;
    const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
    let path = '';
    s.forEach((p, i) => (path += `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`));
    const lastP = s[s.length - 1];
    return {
      path,
      last: { x: x(lastP.t), y: y(lastP.v) },
      band: b ? { y: y(b.high), h: Math.max(1, y(b.low) - y(b.high)), mean: y(b.mean) } : null,
    };
  });
}
