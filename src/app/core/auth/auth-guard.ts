import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth-service';
import { AdminAuthorization } from './admin-authorization';

// La RPC verifica administración; las políticas RLS siguen protegiendo los datos.
export const sessionGuard: CanActivateFn & CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authorization = inject(AdminAuthorization);
  if (!auth.session() || auth.recovery() || auth.initializationError()) return router.createUrlTree(['/login']);
  const allowed = await authorization.verify();
  if (!auth.session() || auth.recovery() || auth.initializationError()) return router.createUrlTree(['/login']);
  return allowed ? true : router.createUrlTree(['/acceso-no-autorizado']);
};
