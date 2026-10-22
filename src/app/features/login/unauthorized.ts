import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { AuthService, authError } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';

@Component({
  selector: 'app-unauthorized',
  imports: [MatButton],
  styleUrl: './login.scss',
  template: `
    <main class="login"><section class="card" aria-labelledby="access-title">
      <span class="brand" aria-hidden="true">TC</span>
      <p class="eyebrow">TusCuentasFacil · Panel administrativo</p>
      <h1 id="access-title">Acceso no autorizado</h1>
      @if (authorization.status() === 'checking') {
        <p role="status">Comprobando permisos…</p>
      } @else if (authorization.status() === 'error') {
        <p role="alert">No se pudieron comprobar tus permisos. El acceso permanece bloqueado. Revisá la conexión e intentá nuevamente.</p>
      } @else {
        <p>Tu cuenta no tiene autorización administrativa activa para acceder al panel. Consultá al responsable del negocio.</p>
      }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <button matButton type="button" [disabled]="busy() || authorization.status() === 'checking'" (click)="retry()">Volver a comprobar</button>
      <button matButton type="button" [disabled]="busy()" (click)="logout()">Cerrar sesión</button>
    </section></main>`,
})
export class Unauthorized {
  readonly authorization = inject(AdminAuthorization);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal('');
  async retry(): Promise<void> { await this.router.navigateByUrl('/dashboard'); }
  async logout(): Promise<void> {
    this.busy.set(true);
    try { await this.auth.signOut(); } catch (error) { this.error.set(authError(error)); }
    finally { this.busy.set(false); }
  }
}
