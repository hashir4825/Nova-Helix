import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AssessmentApi, CrewApi } from '../../core/data/apis';
import { HAZARDS, ROLE_LABEL, SEVERITY_RANK } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { SessionStore } from '../../core/state/session';
import { formatClock } from '../../core/util/format';
import { HELP, STATUS_HELP } from '../../shared/help';
import { HelpHint } from '../../shared/tooltip/help-hint';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { HazardRing } from '../../shared/ui/hazard-ring';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';

/** Flight surgeon's crew directory: one card per astronaut, click to open the profile. */
@Component({
  selector: 'nh-crew-directory',
  imports: [RouterLink, HazardRing, StatusBadge, Icon, Skeleton, TipDirective, HelpHint],
  templateUrl: './crew-directory.html',
  styleUrl: './crew-directory.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrewDirectory {
  private readonly crewApi = inject(CrewApi);
  private readonly assess = inject(AssessmentApi);
  protected readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly team = this.clock.config.team;

  constructor() {
    inject(SessionStore).role.set('surgeon');
  }

  private readonly crew = toSignal(this.crewApi.list());
  private readonly q$ = toObservable(this.clock.query);
  private readonly hazards = toSignal(this.q$.pipe(switchMap((q) => this.assess.hazards(q))));
  private readonly insights = toSignal(this.q$.pipe(switchMap((q) => this.assess.insights(q))));
  private readonly summaries = toSignal(this.q$.pipe(switchMap((q) => this.assess.crewSummaries(q))));

  protected readonly helpTip = {
    title: 'Crew',
    body: 'Everyone on board. Each card shows the astronaut’s overall status, the main reason for it, their highest hazard and today’s check-in. The ring around the initial shows all five hazard scores.',
    hint: 'Click a card to open the full profile',
  };

  protected readonly cards = computed(() => {
    const crew = this.crew();
    const summaries = this.summaries();
    if (!crew || !summaries) return null;
    const hz = this.hazards() ?? [];
    const ins = this.insights() ?? [];
    return crew.map((a) => {
      const s = summaries.find((x) => x.crewId === a.id);
      const mine = hz.filter((h) => h.crewId === a.id);
      const top = mine.length ? mine.reduce((m, h) => (h.score > m.score ? h : m)) : undefined;
      const finding = ins
        .filter((i) => i.crewId === a.id && i.severity !== 'info' && !i.resolution)
        .sort((x, y) => Number(y.id.startsWith('safety:')) - Number(x.id.startsWith('safety:')) || SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || y.detectedAt - x.detectedAt)[0];
      const status = s?.status ?? 'nominal';
      const openFindings = ins.filter((i) => i.crewId === a.id && i.severity !== 'info' && !i.resolution).length;
      return {
        a,
        role: ROLE_LABEL[a.role],
        status,
        statusTip: STATUS_HELP[status],
        reason: status === 'nominal' ? 'All signals inside personal baselines.' : (finding?.title ?? top?.explanation ?? ''),
        hazards: mine,
        top: top ? { label: HAZARDS[top.hazard].label, score: top.score, status: top.status, icon: HAZARD_ICON[top.hazard] } : null,
        openFindings,
        checkIn: s?.checkInHour ?? null,
        checkInTip: s?.checkInHour != null ? HELP.checkInDone(formatClock(s.checkInHour)) : HELP.checkInDue('the morning'),
        nextEvent: s?.nextEvent ?? null,
      };
    });
  });

  protected readonly counts = computed(() => {
    const c = this.cards();
    if (!c) return null;
    return {
      alert: c.filter((x) => x.status === 'alert').length,
      watch: c.filter((x) => x.status === 'watch').length,
      nominal: c.filter((x) => x.status === 'nominal').length,
    };
  });

  protected clock24(h: number): string {
    return formatClock(h);
  }
}
