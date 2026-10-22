import { Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { authRuntime } from './auth-runtime';

export function authError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'invalid_credentials') return 'Correo o contraseña incorrectos.';
  if (code === 'email_not_confirmed') return 'El correo todavía no está confirmado.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Demasiados intentos. Esperá unos minutos y volvé a probar.';
  if (code === 'weak_password') return 'La contraseña no cumple la política de seguridad del proyecto.';
  return 'No se pudo completar la operación. Revisá la conexión y volvé a intentar.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  readonly session = authRuntime.session.asReadonly();
  readonly recovery = authRuntime.recovery.asReadonly();
  readonly initializationError = authRuntime.error.asReadonly();

  constructor() {
    effect(() => {
      if (!this.session() || this.recovery()) void this.router.navigateByUrl('/login');
    });
  }

  private get client() {
    if (!authRuntime.client) throw new Error('Supabase no configurado');
    return authRuntime.client;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await this.router.navigateByUrl('/login');
  }

  async requestRecovery(email: string): Promise<void> {
    const redirectTo = new URL(document.baseURI);
    redirectTo.hash = '';
    redirectTo.search = '';
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo.href });
    if (error) throw error;
  }

  async changePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    await this.signOut();
  }
}
