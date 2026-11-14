import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Astronaut, Insight, ROLE_LABEL, SEVERITY_LABEL, Severity } from '../../core/models';
import { HazardTag } from '../../shared/ui/hazard-tag';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';
import { MissionTimePipe, RelTimePipe } from '../../shared/pipes';

type Filter = 'all' | Severity;

@Component({
  selector: 'nh-insights-feed',
  imports: [RouterLink, StatusBadge, HazardTag, Skeleton, MissionTimePipe, RelTimePipe],
  templateUrl: './insights-feed.html',
  styleUrl: './insights-feed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsFeed {
  /** Undefined while loading. */
  readonly insights = input<Insight[] | undefined>(undefined);
  readonly crew = input<Astronaut[]>([]);
  readonly now = input(0);

  protected readonly filter = signal<Filter>('all');
  protected readonly roleLabel = ROLE_LABEL;

  protected readonly filters = computed(() => {
    const list = this.insights() ?? [];
    const count = (s: Severity) => list.filter((i) => i.severity === s).length;
    return [
      { key: 'all' as Filter, label: 'All', count: list.length },
      { key: 'alert' as Filter, label: SEVERITY_LABEL.alert, count: count('alert') },
      { key: 'watch' as Filter, label: SEVERITY_LABEL.watch, count: count('watch') },
      { key: 'info' as Filter, label: SEVERITY_LABEL.info, count: count('info') },
    ];
  });

  protected readonly visible = computed(() => {
    const f = this.filter();
    const list = this.insights() ?? [];
    return f === 'all' ? list : list.filter((i) => i.severity === f);
  });

  protected readonly crewById = computed(() => new Map(this.crew().map((a) => [a.id, a])));
}
