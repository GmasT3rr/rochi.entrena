import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeAuth } from './app/core/auth/auth-runtime';

initializeAuth()
  .then(() => {
    return bootstrapApplication(App, appConfig);
  })
  .catch(() => {
    document.body.textContent = 'No se pudo iniciar TusCuentasFacil. Recargá la página.';
  });
