import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Mission Control · Nova Healix',
    loadComponent: () => import('./features/mission-control/mission-control').then((m) => m.MissionControl),
  },
  {
    path: 'crew/:id',
    title: 'Astronaut Profile · Nova Healix',
    loadComponent: () => import('./features/pending/pending').then((m) => m.Pending),
    data: { screen: 'Astronaut Profile', milestone: 'M2' },
  },
  {
    path: 'checkin',
    title: 'Crew Check-in · Nova Healix',
    loadComponent: () => import('./features/pending/pending').then((m) => m.Pending),
    data: { screen: 'Crew mode: check-in, questionnaires, inbox', milestone: 'M4' },
  },
  { path: '**', redirectTo: '' },
];
