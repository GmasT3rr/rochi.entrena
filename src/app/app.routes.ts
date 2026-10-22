import { Routes } from '@angular/router';
import { AdminShell } from './layout/admin-shell/admin-shell';
import { sessionGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  {
    path: 'acceso-no-autorizado',
    title: 'Acceso no autorizado',
    loadComponent: () => import('./features/login/unauthorized').then((m) => m.Unauthorized),
  },
  {
    path: 'login',
    title: 'Iniciar sesión',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    component: AdminShell,
    canActivate: [sessionGuard],
    canActivateChild: [sessionGuard],
    children: [
      {
        path: 'te-quiero-rochy',
        title: 'Te quiero Rochy ❤️',
        loadComponent: () => import('./features/rochy/rochy').then((m) => m.Rochy),
      },
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
