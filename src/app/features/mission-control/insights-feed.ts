import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Astronaut, HAZARDS, Insight, SEVERITY_LABEL, Severity } from '../../core/models';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON, STATUS_ICON } from '../../shared/ui/icons';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActionsApi } from '../../core/data/apis';
import { formatClock } from '../../core/util/format';
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
  protected readonly icons = ICON;
  private readonly log = toSignal(inject(ActionsApi).log(), { initialValue: [] });

  /** insightId → "Acknowledged 16:41" / "Messaged 16:40" (latest response). */
  protected readonly acked = computed(() => {
    const m = new Map<string, string>();
    for (const e of [...this.log()].sort((a, b) => a.at - b.at)) {
      if (e.kind === 'reopen') m.delete(e.insightId);
      else m.set(e.insightId, (e.kind === 'acknowledge' ? 'Acknowledged ' : e.kind === 'resolve' ? 'Resolved ' : 'Responded ') + formatClock(e.at));
    }
    return m;
  });

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
    const who = ins.crewId ? this.crewById().get(ins.crewId)?.name : 'Whole crew';
    return {
      title: ins.title,
      body: ins.summary,
      rows: [
        { label: 'Who', value: who ?? '' },
        { label: 'Severity', value: SEVERITY_LABEL[ins.severity], tone: ins.severity },
        { label: 'Hazards', value: ins.hazards.map((h) => HAZARDS[h].short).join(' · ') },
        { label: 'Detected', value: formatMissionTime(ins.detectedAt) },
      ],
      hint: ins.id.startsWith('safety:') ? 'Click to respond now' : 'Click to see the evidence and take action',
    };
  }

  protected readonly crewById = computed(() => new Map(this.crew().map((a) => [a.id, a])));
}
