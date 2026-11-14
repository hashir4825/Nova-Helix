import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HAZARDS, HAZARD_KEYS, HazardAssessment } from '../../core/models';

const SPAN = 72;
const GAP = 9;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
}

/**
 * Five-segment hazard ring, one segment per NASA hazard in canonical order,
 * clockwise from top. Fill length = score (0–100), color = level.
 * Content projected into the center (e.g. the astronaut's initial).
 */
@Component({
  selector: 'nh-hazard-ring',
  template: `
    <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="ariaLabel()">
      @for (s of segments(); track s.key) {
        <path class="track" [attr.d]="s.track" [attr.stroke-width]="thickness()" />
        @if (s.score > 0) {
          <path [class]="'fill s-' + s.status" [attr.d]="s.fill" [attr.stroke-width]="thickness()" />
        }
        @if (labels()) {
          <text class="lbl" [attr.x]="s.label.x" [attr.y]="s.label.y" text-anchor="middle" dominant-baseline="central">{{ s.short }}</text>
        }
      }
    </svg>
    <div class="center"><ng-content /></div>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
      line-height: 0;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .track {
      fill: none;
      stroke: var(--surface-3);
      stroke-linecap: round;
    }
    .fill {
      fill: none;
      stroke: var(--c);
      stroke-linecap: round;
    }
    .s-nominal { --c: var(--nominal); }
    .s-watch { --c: var(--watch); }
    .s-alert { --c: var(--alert); }
    .lbl {
      font-family: var(--font-sans);
      font-size: 8.5px;
      font-weight: 500;
      letter-spacing: 0.06em;
      fill: var(--text-3);
    }
    .center {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      line-height: var(--lh-tight);
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HazardRing {
  readonly assessments = input<HazardAssessment[]>([]);
  readonly size = input(96);
  /** Show RAD/ISO/… labels around the ring. */
  readonly labels = input(true);
  readonly thickness = input(5);

  protected readonly segments = computed(() => {
    const size = this.size();
    const c = size / 2;
    const r = size / 2 - (this.labels() ? 18 : this.thickness() / 2 + 1);
    const byKey = new Map(this.assessments().map((a) => [a.hazard, a]));
    return HAZARD_KEYS.map((key, i) => {
      const a0 = i * SPAN + GAP / 2 - SPAN / 2;
      const a1 = a0 + SPAN - GAP;
      const a = byKey.get(key);
      const score = a?.score ?? 0;
      return {
        key,
        short: HAZARDS[key].short,
        score,
        status: a?.status ?? 'nominal',
        track: arc(c, c, r, a0, a1),
        fill: arc(c, c, r, a0, a0 + Math.max(1, (a1 - a0) * (score / 100))),
        label: polar(c, c, r + 12, (a0 + a1) / 2),
      };
    });
  });

  protected readonly ariaLabel = computed(
    () =>
      'Hazard scores: ' +
      HAZARD_KEYS.map((k) => {
        const a = this.assessments().find((x) => x.hazard === k);
        return `${HAZARDS[k].label} ${a?.score ?? 0}, ${a?.status ?? 'nominal'}`;
      }).join('; '),
  );
}
