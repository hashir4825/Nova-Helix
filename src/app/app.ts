import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Topbar } from './layout/topbar';
import { ThemeStore } from './core/state/theme';

@Component({
  selector: 'nh-root',
  imports: [RouterOutlet, Topbar],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <nh-topbar />
    <main id="main" tabindex="-1">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
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
}
