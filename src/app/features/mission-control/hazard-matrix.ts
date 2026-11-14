import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Astronaut, HAZARDS, HAZARD_KEYS, HazardAssessment, STATUS_LABEL } from '../../core/models';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, STATUS_ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';

const heat = (score: number): number => (score >= 70 ? 4 : score >= 55 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0);

@Component({
  selector: 'nh-hazard-matrix',
  imports: [RouterLink, Icon, Skeleton],
  templateUrl: './hazard-matrix.html',
  styleUrl: './hazard-matrix.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HazardMatrix {
  readonly crew = input<Astronaut[]>([]);
  /** Undefined while loading. */
  readonly assessments = input<HazardAssessment[] | undefined>(undefined);

  protected readonly hazards = HAZARD_KEYS.map((k) => ({ ...HAZARDS[k], icon: HAZARD_ICON[k] }));
  protected readonly statusIcon = STATUS_ICON;
  protected readonly statusLabel = STATUS_LABEL;

  protected readonly rows = computed(() => {
    const all = this.assessments();
    if (!all) return null;
    return this.crew().map((a) => ({
      astronaut: a,
      cells: HAZARD_KEYS.map((k) => {
        const c = all.find((x) => x.crewId === a.id && x.hazard === k);
        const score = c?.score ?? 0;
        return {
          hazard: k,
          label: HAZARDS[k].label,
          score,
          status: c?.status ?? 'nominal',
          heat: heat(score),
          driver: c?.drivers[0]?.label ?? '',
        };
      }),
    }));
  });
}
