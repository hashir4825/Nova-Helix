import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { METRICS, MetricKey } from '../../core/models';
import { MetricSheet } from './metric-sheet';
import { InsightSheet } from './insight-sheet';

/**
 * URL-addressable overlays that work over any screen:
 * `?metric=<crewId>:<metricKey>` opens the Metric Detail sheet.
 * `?insight=<id>` opens the Insight sheet (detail, response, action log).
 */
@Component({
  selector: 'nh-overlays',
  imports: [MetricSheet, InsightSheet],
  template: `
    @if (metric(); as m) {
      <nh-metric-sheet [crewId]="m.crewId" [metric]="m.metric" (closed)="close('metric')" />
    } @else if (insight(); as id) {
      <nh-insight-sheet [insightId]="id" (closed)="close('insight')" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverlayHost {
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly metric = computed(() => {
    const raw = this.params()?.get('metric');
    if (!raw) return null;
    const [crewId, key] = raw.split(':');
    if (!crewId || !(key in METRICS)) return null;
    return { crewId, metric: key as MetricKey };
  });

  protected readonly insight = computed(() => this.params()?.get('insight') ?? null);

  protected close(param: 'metric' | 'insight'): void {
    this.router.navigate([], { queryParams: { [param]: null }, queryParamsHandling: 'merge' });
  }
}
