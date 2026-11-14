import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Mission Control · Nova Healix',
    loadComponent: () => import('./features/mission-control/mission-control').then((m) => m.MissionControl),
  },
  {
    // Flight surgeon's crew directory: pick a member to open their profile.
    path: 'crew',
    title: 'Crew · Nova Healix',
    loadComponent: () => import('./features/crew-directory/crew-directory').then((m) => m.CrewDirectory),
  },
  {
    // Flight surgeon (admin) view of any astronaut.
    path: 'crew/:id',
    title: 'Astronaut Profile · Nova Healix',
    loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
    data: { viewer: 'surgeon' },
  },
  {
    // Astronaut's own profile (Crew Mode home).
    path: 'me',
    title: 'My Health · Nova Healix',
    loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
    data: { viewer: 'astronaut' },
  },
  {
    // Daily check-in + assigned questionnaires (shared with Mission Control).
    path: 'checkin',
    title: 'Check-in · Nova Healix',
    loadComponent: () => import('./features/crew-mode/checkin-page').then((m) => m.CheckinPage),
  },
  {
    path: 'checkin/q/:id',
    title: 'Questionnaire · Nova Healix',
    loadComponent: () => import('./features/crew-mode/questionnaire-runner').then((m) => m.QuestionnaireRunner),
  },
  {
    // Nova: private companion chat.
    path: 'nova',
    title: 'Nova · Nova Healix',
    loadComponent: () => import('./features/crew-mode/nova-page').then((m) => m.NovaPage),
  },
  { path: '**', redirectTo: '' },
];
