import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MissionClock } from '../core/state/mission-clock';
import { ThemeStore } from '../core/state/theme';
import { Icon } from '../shared/ui/icon';
import { ICON } from '../shared/ui/icons';
import { DelayPipe } from '../shared/pipes';
import { TipDirective } from '../shared/tooltip/tip.directive';
import { TipContent } from '../shared/tooltip/tooltip.service';
import { HELP } from '../shared/help';
import { formatDelay } from '../core/util/format';

const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'nh-topbar',
  imports: [RouterLink, RouterLinkActive, Icon, DelayPipe, TipDirective],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  protected readonly clock = inject(MissionClock);
  protected readonly theme = inject(ThemeStore);
  protected readonly icons = ICON;
  private readonly router = inject(Router);

  protected readonly cfg = this.clock.config;
  protected readonly help = HELP;

  protected readonly dayTip = computed<TipContent>(() => {
    const left = this.cfg.durationDays - this.clock.day();
    return {
      ...HELP.day,
      rows: [
        { label: 'Today', value: 'Day ' + this.clock.day() },
        { label: 'Days to Mars', value: String(left) },
        { label: 'Progress', value: Math.round((this.clock.day() / this.cfg.durationDays) * 100) + '%' },
      ],
    };
  });

  protected readonly linkTip = computed<TipContent>(() => {
    const l = this.clock.link();
    if (l.mode === 'autonomous') return HELP.linkAutonomous;
    return {
      ...HELP.link,
      rows: [
        { label: 'One way', value: formatDelay(l.delaySeconds) },
        { label: 'Round trip', value: formatDelay(l.delaySeconds * 2) },
        { label: 'Distance from Earth', value: (l.distanceAu * 149.6).toFixed(0) + ' million km' },
      ],
    };
  });

  protected readonly crewMode = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/checkin') || this.router.url.startsWith('/me')),
    ),
    { initialValue: false },
  );

  protected readonly utcTime = computed(() => {
    const d = this.clock.utc();
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  });

}
