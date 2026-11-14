import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MissionEvent, Status } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { formatDelay } from '../../core/util/format';
import { MissionTimePipe, RelTimePipe } from '../../shared/pipes';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { HelpHint } from '../../shared/tooltip/help-hint';
import { TipContent } from '../../shared/tooltip/tooltip.service';
import { HELP, STATUS_HELP } from '../../shared/help';

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
  imports: [StatusBadge, Skeleton, MissionTimePipe, RelTimePipe, TipDirective, HelpHint],
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
  protected readonly help = HELP;

  protected countTip(status: Status, n: number): TipContent {
    const s = STATUS_HELP[status];
    return { title: `${n} ${n === 1 ? 'astronaut' : 'astronauts'} at ${s.title}`, body: s.body };
  }

  protected readonly dayTip = computed<TipContent>(() => ({
    ...HELP.day,
    rows: [
      { label: 'Days travelled', value: String(this.clock.day()) },
      { label: 'Days to Mars', value: String(this.cfg.durationDays - this.clock.day()) },
    ],
  }));

  protected readonly earthTip = computed<TipContent>(() => ({
    title: 'Earth',
    body: 'Launch point. Every message to Mission Control on Earth is delayed by the distance.',
    rows: [
      { label: 'Distance now', value: `${(this.clock.link().distanceAu * 149.6).toFixed(0)} million km` },
      { label: 'Signal delay', value: formatDelay(this.clock.link().delaySeconds) },
    ],
  }));

  protected readonly marsTip = computed<TipContent>(() => ({
    title: 'Mars',
    body: 'Destination. Arrival is planned for the final mission day.',
    rows: [
      { label: 'Arrival', value: `Day ${this.cfg.durationDays}` },
      { label: 'Days remaining', value: String(this.cfg.durationDays - this.clock.day()) },
    ],
  }));

  protected readonly shipTip = computed<TipContent>(() => {
    const l = this.clock.link();
    return {
      title: `${this.cfg.vehicle}, now`,
      body: 'The spacecraft carrying the four crew. AU = astronomical unit, the Earth–Sun distance (about 150 million km).',
      rows: [
        { label: 'Distance from Earth', value: `${l.distanceAu.toFixed(2)} AU` },
        { label: 'Journey complete', value: `${(this.progress() * 100).toFixed(0)}%` },
        { label: 'Signal delay', value: formatDelay(l.delaySeconds) },
      ],
    };
  });

  protected readonly progress = computed(() => Math.min(1, Math.max(0, this.clock.hour() / 24 / this.cfg.durationDays)));
  protected readonly ship = computed(() => bezier(this.progress()));

  /** Past mission milestones placed on the arc. */
  protected readonly marks = computed(() =>
    [
      { day: 97, label: 'Solar storm D97', tip: { title: 'Solar particle event · Day 97', body: 'A burst of radiation from the Sun. The crew sheltered for 32 hours; this event explains most of the radiation dose differences between astronauts.' } },
      { day: 145, label: 'EVA-3 D145', tip: { title: 'EVA-3 · Day 145', body: 'Planned spacewalk to repair the high-gain antenna gimbal. Ahmad and Hannan are assigned.' } },
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
