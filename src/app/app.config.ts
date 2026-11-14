import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideMockData } from './core/mock/mock-apis';
import { MissionClock } from './core/state/mission-clock';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // Data layer: mock implementations behind abstract API contracts.
    provideMockData(),
    provideAppInitializer(() => inject(MissionClock).load()),
  ],
};
