import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Topbar } from './layout/topbar';
import { TooltipHost } from './shared/tooltip/tooltip-host';
import { OverlayHost } from './features/overlays/overlay-host';
import { ThemeStore } from './core/state/theme';
import { ApiStatus } from './core/state/api-status';

@Component({
  selector: 'nh-root',
  imports: [RouterOutlet, Topbar, TooltipHost, OverlayHost],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <nh-topbar />
    @if (api.unreachable()) {
      <p class="offline" role="status">Can’t reach the Nova Healix server. Showing the last data received; retrying automatically.</p>
    }
    <main id="main" tabindex="-1">
      <router-outlet />
    </main>
    <nh-overlays />
    <nh-tooltip-host />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .offline {
      margin: 0;
      padding: var(--space-2) var(--page-pad);
      background: var(--watch-soft);
      color: var(--text-1);
      font-size: var(--type-caption);
      border-bottom: 1px solid var(--line);
    }
    main {
      flex: 1;
      outline: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Instantiate early so the theme attribute is applied on boot.
  protected readonly theme = inject(ThemeStore);
  protected readonly api = inject(ApiStatus);
}
