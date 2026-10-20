import { Routes } from '@angular/router';
import { AdminShell } from './layout/admin-shell/admin-shell';

export const routes: Routes = [
  {
    path: '',
    component: AdminShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'alumnos',
        title: 'Alumnos',
        loadComponent: () => import('./features/alumnos/alumnos').then((m) => m.Alumnos),
      },
      {
        path: 'cuentas',
        title: 'Cuentas y pagos',
        loadComponent: () => import('./features/cuentas/cuentas').then((m) => m.Cuentas),
      },
      {
        path: 'configuracion',
        title: 'Configuración',
        loadComponent: () =>
          import('./features/configuracion/configuracion').then((m) => m.Configuracion),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
