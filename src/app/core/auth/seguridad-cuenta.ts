import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from './auth-service';
import { authRuntime } from './auth-runtime';
import { supabaseConfig } from './supabase.config';

export const VERIFICADOR_PASSWORD = new InjectionToken<() => SupabaseClient>(
  'Verificación aislada de contraseña',
  {
    providedIn: 'root',
    factory: () => () =>
      createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `tcf-password-${crypto.randomUUID()}`,
        },
      }),
  },
);
import { passwordFuerte } from './password-policy';
export { passwordFuerte } from './password-policy';

@Injectable({ providedIn: 'root' })
export class SeguridadCuenta {
  private readonly auth = inject(AuthService);
  private readonly crearVerificador = inject(VERIFICADOR_PASSWORD);
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly mensaje = signal('');
  readonly requiereCodigo = signal(false);

  private async clienteAutorizado() {
    const session = this.auth.session();
    const client = authRuntime.client;
    if (!session || !client || this.auth.recovery() || this.auth.initializationError())
      throw { code: '42501' };
    const { data, error } = await client
      .rpc('es_administrador_actual')
      .abortSignal(AbortSignal.timeout(10000));
    if (error || data !== true || this.auth.session()?.access_token !== session.access_token)
      throw { code: '42501' };
    return { client, session };
  }

  async cambiar(actual: string, nueva: string, codigo = ''): Promise<boolean> {
    if (this.ocupado()) return false;
    this.error.set('');
    this.mensaje.set('');
    if (actual === nueva) {
      this.error.set('La contraseña nueva debe ser diferente de la actual.');
      return false;
    }
    if (!actual || !passwordFuerte(nueva)) {
      this.error.set(
        'Usá una contraseña nueva de 12 a 128 caracteres con mayúscula, minúscula, número y símbolo.',
      );
      return false;
    }
    this.ocupado.set(true);
    let verificador: SupabaseClient | undefined;
    try {
      const { client, session } = await this.clienteAutorizado();
      const user = await client.auth.getUser();
      if (user.error || user.data.user?.id !== session.user.id || !user.data.user.email)
        throw { code: '42501' };
      verificador = this.crearVerificador();
      const checked = await verificador.auth.signInWithPassword({
        email: user.data.user.email,
        password: actual,
      });
      if (checked.error) throw checked.error;
      if (
        checked.data.user?.id !== session.user.id ||
        this.auth.session()?.access_token !== session.access_token
      )
        throw { code: '42501' };
      // La versión instalada usa current_password. La verificación aislada anterior
      // también exige la contraseña correcta si la política del servidor no lo hace.
      const changed = await client.auth.updateUser({
        password: nueva,
        current_password: actual,
        ...(codigo ? { nonce: codigo.trim() } : {}),
      });
      if (changed.error) throw changed.error;
      if (
        changed.data.user?.id !== session.user.id ||
        this.auth.session()?.user.id !== session.user.id
      )
        throw { code: '42501' };
      this.requiereCodigo.set(false);
      this.mensaje.set('Tu contraseña se cambió correctamente.');
      return true;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid')
        this.requiereCodigo.set(true);
      this.error.set(mensajePassword(code));
      return false;
    } finally {
      // Solo la sesión temporal. No se reemplaza ni se cierra la sesión de la app.
      if (verificador) {
        try {
          await verificador.auth.signOut({ scope: 'local' });
        } catch {
          /* Sin persistencia ni logs. */
        }
      }
      this.ocupado.set(false);
    }
  }
  async enviarCodigo(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.mensaje.set('');
    try {
      const { client, session } = await this.clienteAutorizado();
      const { error } = await client.auth.reauthenticate();
      if (error) throw error;
      if (this.auth.session()?.user.id !== session.user.id) throw { code: '42501' };
      this.requiereCodigo.set(true);
      this.mensaje.set(
        'Te enviamos un código de verificación. Ingresalo y completá nuevamente las contraseñas.',
      );
    } catch (error) {
      this.error.set(mensajePassword((error as { code?: string })?.code));
    } finally {
      this.ocupado.set(false);
    }
  }
}
function mensajePassword(code?: string): string {
  if (['invalid_credentials', 'current_password_mismatch'].includes(code ?? ''))
    return 'La contraseña actual no es correcta.';
  if (code === 'weak_password')
    return 'La contraseña nueva no cumple los requisitos de seguridad de tu cuenta.';
  if (code === 'same_password') return 'La contraseña nueva debe ser diferente de la actual.';
  if (code === 'reauthentication_needed')
    return 'Necesitamos verificar tu identidad. Solicitá el código y volvé a intentarlo.';
  if (code === 'reauthentication_not_valid')
    return 'El código no es válido o venció. Solicitá uno nuevo.';
  if (code === '42501' || code === 'session_not_found')
    return 'No pudimos verificar tu acceso. Volvé a iniciar sesión.';
  if (code?.includes('rate_limit'))
    return 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.';
  return 'No pudimos confirmar el cambio. Revisá tu conexión y volvé a intentarlo.';
}
