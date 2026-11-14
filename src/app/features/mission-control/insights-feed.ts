import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Astronaut, HAZARDS, Insight, SEVERITY_LABEL, Severity } from '../../core/models';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, STATUS_ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { RelTimePipe } from '../../shared/pipes';

type Filter = 'all' | Severity;

@Component({
  selector: 'nh-insights-feed',
  imports: [RouterLink, Icon, Skeleton, RelTimePipe],
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
  protected readonly statusIcon = STATUS_ICON;
  protected readonly hazardIcon = HAZARD_ICON;
  protected readonly hazards = HAZARDS;
  protected readonly severityLabel = SEVERITY_LABEL;

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
