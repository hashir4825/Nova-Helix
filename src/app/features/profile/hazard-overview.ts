import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HAZARDS, HAZARD_KEYS, HazardAssessment, HazardKey } from '../../core/models';
import { STATUS_HELP } from '../../shared/help';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Icon } from '../../shared/ui/icon';
import { HAZARD_ICON, ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';

/**
 * NASA's five hazards for one astronaut, straight from GET /api/assessment/hazards (score, status,
 * headline, explanation, drivers). Astronauts see status + plain-language explanation; the flight
 * surgeon also sees the 0–100 score and driver contributions.
 */
@Component({
  selector: 'nh-hazard-overview',
  imports: [StatusBadge, Icon, Skeleton, TipDirective, RouterLink, NgTemplateOutlet],
  templateUrl: './hazard-overview.html',
  styleUrl: './hazard-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HazardOverview {
  readonly crewId = input.required<string>();
  /** This astronaut's assessments (undefined while loading). */
  readonly assessments = input<HazardAssessment[] | undefined>(undefined);
  readonly astronautView = input(false);
  /** Hazard to open on arrival (from ?hazard= when coming from the Overview table). */
  readonly focus = input<string | undefined>(undefined);

  protected readonly icons = ICON;
  protected readonly statusHelp = STATUS_HELP;
  protected readonly open = signal<HazardKey | null>(null);


  protected readonly tiles = computed(() => {
    const a = this.assessments();
    if (!a) return null;
    return HAZARD_KEYS.map((k) => {
      const x = a.find((h) => h.hazard === k)!;
      return {
        ...x,
        def: HAZARDS[k],
        icon: HAZARD_ICON[k],
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

  constructor() {
    effect(() => {
      const f = this.focus();
      if (f && (HAZARD_KEYS as readonly string[]).includes(f)) untracked(() => this.open.set(f as HazardKey));
    });
  }

  protected toggle(k: HazardKey): void {
    this.open.update((cur) => (cur === k ? null : k));
  }
}
