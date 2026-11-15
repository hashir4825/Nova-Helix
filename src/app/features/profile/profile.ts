import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AssessmentApi, CrewApi } from '../../core/data/apis';
import { MobilitySummary } from '../crew-mode/mobility/mobility-summary';
import { HazardOverview } from './hazard-overview';
import { ROLE_LABEL, SEVERITY_RANK, Status } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { Role, SessionStore } from '../../core/state/session';
import { formatClock } from '../../core/util/format';
import { HELP, STATUS_HELP } from '../../shared/help';
import { ClockPipe, RelTimePipe } from '../../shared/pipes';
import { HelpHint } from '../../shared/tooltip/help-hint';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { HazardRing } from '../../shared/ui/hazard-ring';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON, STATUS_ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';
import { CheckinHistory } from './checkin-history';
import { VitalsStrip } from './vitals-strip';

@Component({
  selector: 'nh-profile',
  imports: [
    RouterLink,
    StatusBadge,
    HazardRing,
    Icon,
    Skeleton,
    TipDirective,
    HelpHint,
    ClockPipe,
    RelTimePipe,
    VitalsStrip,
    CheckinHistory,
    MobilitySummary,
    HazardOverview,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile {
  /** Route param (surgeon view). */
  readonly id = input<string>();
  /** ?hazard=<key>: open that hazard in the hazard panel (links from the Overview table). */
  readonly hazard = input<string | undefined>();
  /** Route data: who is looking. */
  readonly viewer = input<Role>('surgeon');

  private readonly session = inject(SessionStore);
  private readonly crewApi = inject(CrewApi);
  private readonly assess = inject(AssessmentApi);
  protected readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly statusIcon = STATUS_ICON;
  protected readonly hazardIcon = HAZARD_ICON;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly help = HELP;

  constructor() {
    effect(() => this.session.role.set(this.viewer()));
  }

  protected readonly isAstronaut = computed(() => this.viewer() === 'astronaut');
  protected readonly crewId = computed(() => (this.isAstronaut() ? this.session.astronautId() : (this.id() ?? 'hashir')));

  protected readonly crew = toSignal(this.crewApi.list(), { initialValue: [] });
  protected readonly astronaut = computed(() => this.crew().find((a) => a.id === this.crewId()));

  private readonly q$ = toObservable(this.clock.query);
  private readonly allHazards = toSignal(this.q$.pipe(switchMap((q) => this.assess.hazards(q))));
  private readonly allInsights = toSignal(this.q$.pipe(switchMap((q) => this.assess.insights(q))));
  private readonly summaries = toSignal(this.q$.pipe(switchMap((q) => this.assess.crewSummaries(q))));

  protected readonly hazards = computed(() => this.allHazards()?.filter((h) => h.crewId === this.crewId()));
  protected readonly summary = computed(() => this.summaries()?.find((s) => s.crewId === this.crewId()));
  protected readonly statusOf = (id: string): Status | undefined => this.summaries()?.find((s) => s.crewId === id)?.status;

  protected readonly insights = computed(() =>
    (this.allInsights() ?? [])
      .filter((i) => (i.crewId === this.crewId() || i.crewId === null) && !i.resolution)
      // The astronaut never sees the clinical safety alert about themself; they get the support note instead.
      .filter((i) => !(this.isAstronaut() && i.id.startsWith('safety:')))
      .sort((a, b) => urgentRank(b) - urgentRank(a) || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.detectedAt - a.detectedAt),
  );
  /** Active Nova safety alert for this astronaut. */
  protected readonly urgent = computed(() =>
    (this.allInsights() ?? []).find((i) => i.id.startsWith('safety:') && i.crewId === this.crewId() && !i.resolution),
  );
  protected readonly surgeon = this.clock.config.team.flightSurgeon;
  protected readonly helperName = computed(() => {
    const others = this.crew().filter((a) => a.id !== this.crewId());
    return (others.find((a) => a.role === 'CDR') ?? others.find((a) => a.role === 'CMO') ?? others[0])?.name ?? 'your crew';
  });

  protected readonly attention = computed(() => this.insights().filter((i) => i.severity !== 'info').slice(0, 3));

  /** One-sentence reason for the overall status. */
  protected readonly reason = computed(() => {
    const s = this.summary();
    if (!s) return '';
    if (this.isAstronaut() && this.urgent()) return `${this.surgeon} has been asked to support you.`;
    if (s.status === 'nominal') {
      return this.isAstronaut() ? 'Everything is inside your normal range today.' : 'All signals are inside personal baselines.';
    }
    const top = this.attention()[0];
    if (top) return top.title + '.';
    const worst = this.hazards()?.slice().sort((a, b) => b.score - a.score)[0];
    return worst?.explanation ?? '';
  });

  protected readonly statusTip = computed(() => {
    const s = this.summary();
    return s ? STATUS_HELP[s.status] : null;
  });

  protected readonly checkInTip = computed(() => {
    const s = this.summary();
    if (!s) return null;
    return s.checkInHour !== null ? HELP.checkInDone(formatClock(s.checkInHour)) : HELP.checkInDue('the morning');
  });

  protected readonly ringTip = computed(() => ({
    title: 'Hazard ring',
    body: 'One segment per NASA hazard, clockwise from the top: Radiation, Isolation, Distance, Gravity, Environment. A longer, warmer segment means more attention is needed.',
  }));

  protected readonly bandOwner = computed(() => (this.isAstronaut() ? 'Your normal' : `${this.astronaut()?.name ?? ''}'s normal`));


  protected readonly crewWithStatus = computed(() => this.crew().map((a) => ({ ...a, status: this.statusOf(a.id) })));
}

function urgentRank(i: { id: string }): number {
  return i.id.startsWith('safety:') ? 1 : 0;
}
