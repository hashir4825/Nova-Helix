import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { AssessmentApi, CrewApi, MissionApi } from '../../core/data/apis';
import { HazardAssessment, Status } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { withLoad } from '../../core/util/load';
import { Panel } from '../../shared/ui/panel';
import { Skeleton } from '../../shared/ui/skeleton';
import { CrewCard } from './crew-card';
import { HazardMatrix } from './hazard-matrix';
import { InsightsFeed } from './insights-feed';
import { MissionHero } from './mission-hero';

@Component({
  selector: 'nh-mission-control',
  imports: [Panel, CrewCard, InsightsFeed, HazardMatrix, MissionHero, Skeleton],
  templateUrl: './mission-control.html',
  styleUrl: './mission-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionControl {
  protected readonly clock = inject(MissionClock);
  private readonly crewApi = inject(CrewApi);
  private readonly assess = inject(AssessmentApi);
  private readonly missionApi = inject(MissionApi);

  /** Bumped by "Retry" in error states. */
  private readonly reload = signal(0);
  private readonly query$ = combineLatest([toObservable(this.clock.query), toObservable(this.reload)]);

  protected readonly crew = toSignal(withLoad(this.crewApi.list()), { initialValue: { state: 'loading' as const } });
  protected readonly crewList = computed(() => {
    const c = this.crew();
    return c.state === 'ready' ? c.value : [];
  });

  protected readonly hazards = toSignal(this.query$.pipe(switchMap(([q]) => this.assess.hazards(q))));
  protected readonly insights = toSignal(this.query$.pipe(switchMap(([q]) => this.assess.insights(q))));
  protected readonly summaries = toSignal(this.query$.pipe(switchMap(([q]) => this.assess.crewSummaries(q))));
  private readonly events = toSignal(this.missionApi.events(), { initialValue: [] });

  protected readonly counts = computed(() => {
    const s = this.summaries();
    if (!s) return null;
    const by = (st: Status) => s.filter((x) => x.status === st).length;
    return [
      { status: 'alert' as Status, n: by('alert') },
      { status: 'watch' as Status, n: by('watch') },
      { status: 'nominal' as Status, n: by('nominal') },
    ];
  });

  protected readonly nextEvent = computed(() => {
    const h = this.clock.hour();
    return this.events()
      .filter((e) => e.start > h && e.kind !== 'exercise')
      .sort((a, b) => a.start - b.start)[0];
  });

  protected summaryFor(id: string) {
    return this.summaries()?.find((s) => s.crewId === id);
  }

  protected hazardsFor(id: string): HazardAssessment[] {
    return this.hazards()?.filter((h) => h.crewId === id) ?? [];
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }
}
