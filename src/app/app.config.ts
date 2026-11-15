import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { routes } from './app.routes';
import { provideMockData } from './core/mock/mock-apis';
import { provideHttpData } from './core/http/http-apis';
import { API_BASE_URL, resolveDataSource } from './core/data/data-source';
import { MissionClock } from './core/state/mission-clock';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // Data layer: abstract API contracts bound to the backend (?data=api) or seeded mock data (default).
    ...(resolveDataSource() === 'api' ? provideHttpData(API_BASE_URL) : provideMockData()),
    provideEchartsCore({ echarts: () => import('./shared/charts/echarts-setup').then((m) => m.default) }),
    provideAppInitializer(() => inject(MissionClock).load()),
  ],
};
