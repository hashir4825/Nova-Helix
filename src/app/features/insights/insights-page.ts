import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ActionsApi, AssessmentApi, CrewApi } from '../../core/data/apis';
import { HAZARDS, Insight, ROLE_LABEL, SEVERITY_LABEL, SEVERITY_RANK, Severity } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { SessionStore } from '../../core/state/session';
import { formatClock, formatMissionTime } from '../../core/util/format';
import { HelpHint } from '../../shared/tooltip/help-hint';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON, IconNode, STATUS_ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { RelTimePipe } from '../../shared/pipes';
import { FancyOption, FancySelect } from '../../shared/ui/fancy-select';

type View = 'active' | 'resolved' | 'all';
type SevFilter = 'any' | Severity;

/** All findings, per astronaut, with Active / Resolved history. */
@Component({
  selector: 'nh-insights-page',
  imports: [RouterLink, Icon, Skeleton, TipDirective, HelpHint, RelTimePipe, FancySelect],
  templateUrl: './insights-page.html',
  styleUrl: './insights-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsPage {
  /** Query param `?member=<crewId>|all|crew`, bound by the router. */
  readonly member = input<string | undefined>();

  private readonly router = inject(Router);
  private readonly assess = inject(AssessmentApi);
  protected readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly statusIcon = STATUS_ICON;
  protected readonly hazardIcon = HAZARD_ICON;
  protected readonly hazards = HAZARDS;
  protected readonly sevLabel = SEVERITY_LABEL;

  constructor() {
    inject(SessionStore).role.set('surgeon');
  }

  protected readonly crew = toSignal(inject(CrewApi).list(), { initialValue: [] });
  private readonly all = toSignal(toObservable(this.clock.query).pipe(switchMap((q) => this.assess.insights(q))));
  private readonly log = toSignal(inject(ActionsApi).log(), { initialValue: [] });

  protected readonly sevOptions: { key: SevFilter; label: string; icon?: IconNode }[] = [
    { key: 'any', label: 'Any severity' },
    { key: 'alert', label: SEVERITY_LABEL.alert, icon: STATUS_ICON.alert },
    { key: 'watch', label: SEVERITY_LABEL.watch, icon: STATUS_ICON.watch },
    { key: 'info', label: SEVERITY_LABEL.info, icon: STATUS_ICON.info },
  ];

  protected readonly tabs = computed<{ key: View; label: string; n: number }[]>(() => {
    const c = this.counts();
    return [
      { key: 'active', label: 'Active', n: c.active },
      { key: 'resolved', label: 'Resolved', n: c.resolved },
      { key: 'all', label: 'All', n: c.all },
    ];
  });

  protected readonly view = signal<View>('active');
  protected readonly sev = signal<SevFilter>('any');
  protected readonly selected = computed(() => this.member() ?? 'all');

  protected readonly memberOptions = computed<FancyOption[]>(() => {
    const list = this.all() ?? [];
    const active = (pred: (i: Insight) => boolean) => list.filter((i) => !i.resolution && pred(i)).length;
    return [
      { value: 'all', label: 'All crew', sub: 'Every finding', badge: `${active(() => true)} active` },
      ...this.crew().map((a) => ({ value: a.id, label: a.name, sub: ROLE_LABEL[a.role], initial: a.name.charAt(0), badge: `${active((i) => i.crewId === a.id)} active` })),
      { value: 'crew', label: 'Whole crew', sub: 'Ship-wide findings, e.g. cabin air', badge: `${active((i) => i.crewId === null)} active` },
    ];
  });

  private readonly forMember = computed(() => {
    const m = this.selected();
    const list = this.all() ?? [];
    if (m === 'all') return list;
    if (m === 'crew') return list.filter((i) => i.crewId === null);
    return list.filter((i) => i.crewId === m);
  });

  protected readonly counts = computed(() => {
    const l = this.forMember();
    return { active: l.filter((i) => !i.resolution).length, resolved: l.filter((i) => i.resolution).length, all: l.length };
  });

  protected readonly rows = computed(() => {
    if (!this.all()) return null;
    const v = this.view();
    const s = this.sev();
    const lastAction = new Map<string, string>();
    for (const e of [...this.log()].sort((a, b) => a.at - b.at)) {
      if (e.kind === 'reopen') lastAction.delete(e.insightId);
      else if (e.kind !== 'resolve') lastAction.set(e.insightId, `${e.label} · ${formatClock(e.at)}`);
    }
    const urgent = (i: Insight) => (i.id.startsWith('safety:') ? 1 : 0);
    return this.forMember()
      .filter((i) => (v === 'all' ? true : v === 'active' ? !i.resolution : !!i.resolution))
      .filter((i) => s === 'any' || i.severity === s)
      .sort((a, b) =>
        v === 'resolved'
          ? (b.resolution?.at ?? 0) - (a.resolution?.at ?? 0)
          : Number(!!a.resolution) - Number(!!b.resolution) || urgent(b) - urgent(a) || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.detectedAt - a.detectedAt,
      )
      .map((i) => ({
        i,
        who: i.crewId ? this.crew().find((a) => a.id === i.crewId) : undefined,
        urgent: !!urgent(i),
        last: lastAction.get(i.id),
      }));
  });

  protected setMember(value: string): void {
    this.router.navigate([], { queryParams: { member: value === 'all' ? null : value }, queryParamsHandling: 'merge' });
  }

  protected when(h: number): string {
    return formatMissionTime(h);
  }

  protected readonly helpTip = {
    title: 'Insights',
    body: 'Every finding for the crew. Pick an astronaut to see only theirs. Active findings need attention; resolved ones are kept with the note on what was done. A resolved finding reopens itself if it gets worse.',
    hint: 'Click a finding to see evidence, respond or resolve',
  };
}
