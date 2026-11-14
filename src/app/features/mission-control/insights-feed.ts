import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Astronaut, HAZARDS, Insight, SEVERITY_LABEL, Severity } from '../../core/models';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, STATUS_ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { RelTimePipe } from '../../shared/pipes';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { TipContent } from '../../shared/tooltip/tooltip.service';
import { STATUS_HELP } from '../../shared/help';
import { formatMissionTime } from '../../core/util/format';

type Filter = 'all' | Severity;

@Component({
  selector: 'nh-insights-feed',
  imports: [RouterLink, Icon, Skeleton, RelTimePipe, TipDirective],
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
      { key: 'all' as Filter, label: 'All', count: list.length, tip: 'Show every finding' },
      { key: 'alert' as Filter, label: SEVERITY_LABEL.alert, count: count('alert'), tip: STATUS_HELP.alert },
      { key: 'watch' as Filter, label: SEVERITY_LABEL.watch, count: count('watch'), tip: STATUS_HELP.watch },
      { key: 'info' as Filter, label: SEVERITY_LABEL.info, count: count('info'), tip: STATUS_HELP.info },
    ];
  });

  protected readonly visible = computed(() => {
    const f = this.filter();
    const list = this.insights() ?? [];
    return f === 'all' ? list : list.filter((i) => i.severity === f);
  });

  /** Tooltip summarising severity, hazards, timing and confidence. */
  protected itemTip(ins: Insight): TipContent {
    const sev = STATUS_HELP[ins.severity];
    return {
      title: sev.title + ': ' + ins.title,
      body: sev.body,
      rows: [
        { label: 'Hazards', value: ins.hazards.map((h) => HAZARDS[h].short).join(' · ') },
        { label: 'Detected', value: formatMissionTime(ins.detectedAt) },
        { label: 'Confidence', value: Math.round(ins.confidence * 100) + '%' },
      ],
      hint: 'Click to see the evidence and take action',
    };
  }

  protected readonly crewById = computed(() => new Map(this.crew().map((a) => [a.id, a])));
}
