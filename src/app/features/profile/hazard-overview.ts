import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, map, switchMap } from 'rxjs';
import { AssessmentApi } from '../../core/data/apis';
import { HAZARDS, HAZARD_KEYS, HazardAssessment, HazardKey, Sample } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { STATUS_HELP } from '../../shared/help';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { Sparkline } from '../../shared/ui/sparkline';
import { StatusBadge } from '../../shared/ui/status-badge';

/**
 * NASA's five hazards for one astronaut. Astronauts see status + plain-language
 * explanation; the flight surgeon additionally sees the 0–100 score and driver weights.
 */
@Component({
  selector: 'nh-hazard-overview',
  imports: [StatusBadge, Icon, Sparkline, Skeleton, TipDirective, RouterLink, NgTemplateOutlet],
  templateUrl: './hazard-overview.html',
  styleUrl: './hazard-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HazardOverview {
  readonly crewId = input.required<string>();
  /** This astronaut's assessments (undefined while loading). */
  readonly assessments = input<HazardAssessment[] | undefined>(undefined);
  readonly astronautView = input(false);

  private readonly assess = inject(AssessmentApi);
  private readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly statusHelp = STATUS_HELP;
  protected readonly open = signal<HazardKey | null>(null);

  private readonly history = toSignal(
    combineLatest([toObservable(this.crewId), toObservable(this.clock.query)]).pipe(
      switchMap(([id, q]) => {
        const from = Math.max(1, Math.floor(q.atHour / 24) + 1 - 30);
        return combineLatest(HAZARD_KEYS.map((k) => this.assess.hazardHistory(q, k, id, from).pipe(map((s) => [k, s] as const))));
      }),
      map((pairs) => new Map<HazardKey, Sample[]>(pairs)),
    ),
  );

  protected readonly tiles = computed(() => {
    const a = this.assessments();
    if (!a) return null;
    const hist = this.history();
    return HAZARD_KEYS.map((k) => {
      const x = a.find((h) => h.hazard === k)!;
      return {
        ...x,
        def: HAZARDS[k],
        icon: HAZARD_ICON[k],
        trend: hist?.get(k) ?? [],
        tip: {
          title: HAZARDS[k].label,
          body: HAZARDS[k].description,
          hint: 'Click to see what feeds this hazard',
        },
      };
    });
  });

  protected readonly detail = computed(() => {
    const k = this.open();
    if (!k) return null;
    return this.tiles()?.find((t) => t.hazard === k) ?? null;
  });

  protected toggle(k: HazardKey): void {
    this.open.update((cur) => (cur === k ? null : k));
  }
}
