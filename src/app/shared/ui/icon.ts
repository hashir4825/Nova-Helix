import { ChangeDetectionStrategy, Component, ElementRef, Renderer2, effect, inject, input } from '@angular/core';
import { IconNode } from './icons';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Lucide line icon rendered from its node definition (tree-shaken, no runtime registry).
 * Decorative by default; pass `label` to expose it to assistive tech.
 */
@Component({
  selector: 'nh-icon',
  template: '',
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
      color: inherit;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly icon = input.required<IconNode>();
  readonly size = input(16);
  readonly stroke = input(1.5);
  readonly label = input<string | undefined>(undefined);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly r = inject(Renderer2);

  constructor() {
    effect(() => {
      const el = this.host.nativeElement;
      while (el.firstChild) el.removeChild(el.firstChild);
      const svg = this.r.createElement('svg', SVG_NS) as SVGElement;
      const size = String(this.size());
      const attrs: Record<string, string> = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': String(this.stroke()),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        focusable: 'false',
      };
      for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
      const label = this.label();
      if (label) {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', label);
      } else {
        svg.setAttribute('aria-hidden', 'true');
      }
      for (const [tag, a] of this.icon()) {
        const child = this.r.createElement(tag, SVG_NS) as SVGElement;
        for (const [k, v] of Object.entries(a)) if (v !== undefined) child.setAttribute(k, String(v));
        svg.appendChild(child);
      }
      el.appendChild(svg);
    });
  }
}
