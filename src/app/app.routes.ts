import { cambiosGuard } from './core/services/cambios-pendientes';
import { Routes } from '@angular/router';
import { AdminShell } from './layout/admin-shell/admin-shell';
import { sessionGuard } from './core/auth/auth-guard';

export const routes: Routes = [
  {
    path: 'documentos/:id',
    canActivate: [sessionGuard],
    title: 'Documento',
    loadComponent: () =>
      import('./features/alumnos/documento-office').then((m) => m.DocumentoOffice),
  },
  {
    path: 'nueva-contrasena',
    title: 'Establecer contraseña',
    loadComponent: () => import('./features/login/nueva-contrasena').then((m) => m.NuevaContrasena),
  },
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
    // Every protected destination is checked once, before child activation.
    canActivateChild: [sessionGuard],
    children: [
      {
        path: 'te-quiero-rochy',
        canDeactivate: [cambiosGuard],
        title: 'Te quiero Rochy ❤️',
        loadComponent: () => import('./features/rochy/rochy').then((m) => m.Rochy),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canDeactivate: [cambiosGuard],
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'alumnos',
        canDeactivate: [cambiosGuard],
        title: 'Alumnos',
        loadComponent: () => import('./features/alumnos/alumnos').then((m) => m.Alumnos),
      },
      {
        path: 'cuentas',
        canDeactivate: [cambiosGuard],
        title: 'Cuotas y cobros',
        loadComponent: () => import('./features/cuentas/cuentas').then((m) => m.Cuentas),
      },
      {
        path: 'guia',
        title: 'Guía de uso',
        loadComponent: () => import('./features/guia/guia').then((m) => m.Guia),
      },
      {
        path: 'pendientes',
        canDeactivate: [cambiosGuard],
        title: 'Centro de pendientes',
        loadComponent: () => import('./features/pendientes/pendientes').then((m) => m.Pendientes),
      },
      {
        path: 'configuracion',
        canDeactivate: [cambiosGuard],
        title: 'Configuración',
        loadComponent: () =>
          import('./features/configuracion/configuracion').then((m) => m.Configuracion),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
