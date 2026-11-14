import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MissionEvent, Status } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { formatDelay } from '../../core/util/format';
import { MissionTimePipe, RelTimePipe } from '../../shared/pipes';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';

// Transfer arc, Earth → Mars (cubic Bézier in a 640×220 box).
const P0 = { x: 64, y: 168 };
const P1 = { x: 190, y: 28 };
const P2 = { x: 440, y: 6 };
const P3 = { x: 578, y: 92 };

function bezier(t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
    y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y,
  };
}

@Component({
  selector: 'nh-mission-hero',
  imports: [StatusBadge, Skeleton, MissionTimePipe, RelTimePipe],
  templateUrl: './mission-hero.html',
  styleUrl: './mission-hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionHero {
  readonly counts = input<{ status: Status; n: number }[] | null>(null);
  readonly nextEvent = input<MissionEvent | undefined>(undefined);

  protected readonly clock = inject(MissionClock);
  protected readonly cfg = this.clock.config;
  protected readonly path = `M${P0.x},${P0.y} C${P1.x},${P1.y} ${P2.x},${P2.y} ${P3.x},${P3.y}`;
  protected readonly earth = P0;
  protected readonly mars = P3;

  protected readonly progress = computed(() => Math.min(1, Math.max(0, this.clock.hour() / 24 / this.cfg.durationDays)));
  protected readonly ship = computed(() => bezier(this.progress()));

  /** Past mission milestones placed on the arc. */
  protected readonly marks = computed(() =>
    [
      { day: 97, label: 'Solar storm D97' },
      { day: 145, label: 'EVA-3 D145' },
    ].map((m) => ({ ...m, ...bezier(m.day / this.cfg.durationDays), past: m.day <= this.clock.day() })),
  );

  protected readonly ticks = Array.from({ length: 11 }, (_, i) => {
    const p = bezier(i / 10);
    return { ...p, major: i % 5 === 0 };
  });

  protected readonly aria = computed(() => {
    const l = this.clock.link();
    return `Transit progress: day ${this.clock.day()} of ${this.cfg.durationDays}. ${l.distanceAu.toFixed(2)} astronomical units from Earth, one-way signal delay ${formatDelay(l.delaySeconds)}.`;
  });

  protected readonly crewTotal = computed(() => (this.counts() ?? []).reduce((s, c) => s + c.n, 0));
}
