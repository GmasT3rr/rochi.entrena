import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { authRuntime, hasAuthCallback, initializeAuth } from './app/core/auth/auth-runtime';

initializeAuth().then(() => {
  if (hasAuthCallback(new URL(window.location.href))) {
    // En un callback fallido preservar la URL; el router hash no debe tocarla.
    document.body.textContent = authRuntime.error() || 'No se pudo procesar el enlace. Solicitá uno nuevo y abrilo en el navegador donde lo pediste.';
    return;
  }
  return bootstrapApplication(App, appConfig);
}).catch(() => {
  document.body.textContent = 'No se pudo iniciar TusCuentasFacil. Recargá la página.';
});
