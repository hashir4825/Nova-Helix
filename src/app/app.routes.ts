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
    path: 'checkin',
    title: 'Crew Check-in · Nova Healix',
    loadComponent: () => import('./features/pending/pending').then((m) => m.Pending),
    data: { screen: 'Crew mode: check-in, questionnaires, inbox', milestone: 'M4' },
  },
  { path: '**', redirectTo: '' },
];
