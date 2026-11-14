import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MissionClock } from '../core/state/mission-clock';
import { ThemeStore } from '../core/state/theme';
import { Icon } from '../shared/ui/icon';
import { ICON } from '../shared/ui/icons';
import { DelayPipe } from '../shared/pipes';

const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'nh-topbar',
  imports: [RouterLink, Icon, DelayPipe],
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

  protected readonly crewMode = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/checkin')),
    ),
    { initialValue: false },
  );

  protected readonly utcTime = computed(() => {
    const d = this.clock.utc();
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  });

}
