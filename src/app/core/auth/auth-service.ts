import { Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { authRuntime, clearPasswordFlow } from './auth-runtime';
import { authRedirectUrl, PASSWORD_LINK_ERROR } from './auth-callback';
import { passwordFuerte } from './password-policy';

export function authError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'invalid_credentials') return 'Correo o contraseña incorrectos.';
  if (code === 'email_not_confirmed') return 'El correo todavía no está confirmado.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit')
    return 'Demasiados intentos. Esperá unos minutos y volvé a probar.';
  if (code === 'weak_password')
    return 'La contraseña no cumple la política de seguridad del proyecto.';
  if (code === 'same_password') return 'Elegí una contraseña diferente de la anterior.';
  if (code === 'password_policy')
    return 'Usá de 12 a 128 caracteres, con mayúscula, minúscula, número y símbolo.';
  if (
    [
      'invalid_password_session',
      'session_not_found',
      'session_expired',
      'otp_expired',
      'bad_code_verifier',
      'flow_state_expired',
      'flow_state_not_found',
    ].includes(code ?? '')
  )
    return PASSWORD_LINK_ERROR;
  if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid')
    return 'Necesitamos un enlace nuevo para verificar tu identidad. Solicitá otro correo de recuperación.';
  return 'No se pudo completar la operación. Revisá la conexión y volvé a intentar.';
}
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  readonly session = authRuntime.session.asReadonly();
  readonly recovery = authRuntime.recovery.asReadonly();
  readonly passwordFlow = authRuntime.passwordFlow.asReadonly();
  readonly passwordLinkError = authRuntime.passwordError.asReadonly();
  readonly initializationError = authRuntime.error.asReadonly();
  constructor() {
    effect(() => {
      if (this.recovery() && (this.session() || this.passwordLinkError())) {
        void this.router.navigateByUrl('/nueva-contrasena', { replaceUrl: true });
      } else if (
        !this.session() &&
        this.router.navigated &&
        !/^\/(login|nueva-contrasena)(?:[?;]|$)/.test(this.router.url)
      ) {
        void this.router.navigateByUrl('/login');
      }
    });
  }
  private get client() {
    if (!authRuntime.client) throw new Error('Auth unavailable');
    return authRuntime.client;
  }
  async signIn(email: string, password: string): Promise<void> {
    if (this.recovery()) throw { code: 'invalid_password_session' };
    const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }
  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    clearPasswordFlow();
    authRuntime.session.set(null);
    await this.router.navigateByUrl('/login');
  }
  async requestRecovery(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(),
    });
    if (error) throw error;
  }
  async validatePasswordSession(): Promise<string> {
    const flow = this.passwordFlow();
    if (
      !flow ||
      !this.recovery() ||
      this.initializationError() ||
      flow.expiresAt <= Date.now() ||
      this.session()?.user.id !== flow.userId
    )
      throw { code: 'invalid_password_session' };
    const { data, error } = await this.client.auth.getSession();
    if (error || data.session?.user.id !== flow.userId) throw { code: 'invalid_password_session' };
    // getSession es local; getUser verifica la identidad con Auth antes de habilitar/escribir.
    const checked = await this.client.auth.getUser();
    if (
      checked.error ||
      checked.data.user?.id !== flow.userId ||
      this.passwordFlow() !== flow ||
      this.session()?.user.id !== flow.userId ||
      flow.expiresAt <= Date.now()
    )
      throw { code: 'invalid_password_session' };
    return flow.userId;
  }
  async changePassword(password: string): Promise<void> {
    if (!passwordFuerte(password)) throw { code: 'password_policy' };
    const userId = await this.validatePasswordSession();
    const { data, error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    if (data.user?.id !== userId || this.session()?.user.id !== userId)
      throw { code: 'invalid_password_session' };
    // Cerrar sesión es un paso separado: su fallo nunca implica que falló el guardado.
  }
}
