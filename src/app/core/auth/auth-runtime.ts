import { signal } from '@angular/core';
import {
  createClient,
  Session,
  SupabaseClient,
  SupabaseClientOptions,
} from '@supabase/supabase-js';
import { supabaseConfig } from './supabase.config';
import {
  authParameters,
  cleanCallbackUrl,
  hasAuthCallback,
  PASSWORD_LINK_ERROR,
  PasswordFlow,
  PasswordFlowKind,
  passwordKind,
  readPasswordFlow,
  storePasswordFlow,
  hasStoredPasswordFlow,
  sdkCallbackUrl,
} from './auth-callback';
export { hasAuthCallback } from './auth-callback';

export const authRuntime = {
  session: signal<Session | null>(null),
  recovery: signal(false),
  passwordFlow: signal<PasswordFlow | null>(null),
  passwordError: signal(''),
  error: signal(''),
  client: null as SupabaseClient | null,
};
export function clearPasswordFlow(): void {
  authRuntime.passwordFlow.set(null);
  authRuntime.passwordError.set('');
  authRuntime.recovery.set(false);
  storePasswordFlow(null);
}
function beginPasswordFlow(session: Session, kind: PasswordFlowKind): void {
  const flow = { kind, userId: session.user.id, expiresAt: Date.now() + 60 * 60 * 1000 };
  authRuntime.recovery.set(true);
  authRuntime.passwordFlow.set(flow);
  authRuntime.passwordError.set('');
  storePasswordFlow(flow);
}

/** Consumir el callback con el SDK ANTES de arrancar el router hash. */
export type AuthClientFactory = (
  url: string,
  key: string,
  options: SupabaseClientOptions<'public'>,
) => SupabaseClient;
export async function initializeAuth(
  createAuthClient: AuthClientFactory = createClient,
): Promise<void> {
  const initialUrl = new URL(window.location.href);
  const params = authParameters(initialUrl);
  const callback = hasAuthCallback(initialUrl);
  const kind = passwordKind(params.get('type'));
  const savedFlow = readPasswordFlow();
  const hadFlow = hasStoredPasswordFlow();
  let destination = '/login';
  let recoveryEvent = false;
  let failedCallback = false;
  let consumingCallback = true;
  authRuntime.session.set(null);
  authRuntime.error.set('');
  clearPasswordFlow();
  // No permitir consultas de negocio mientras se determina la clase de sesión.
  if (callback || hadFlow) authRuntime.recovery.set(true);
  try {
    if (!supabaseConfig.url || !supabaseConfig.publishableKey?.startsWith('sb_publishable_')) {
      authRuntime.error.set('No se pudo configurar el acceso. Contactá al administrador.');
      return;
    }
    if (callback) window.history.replaceState(null, '', sdkCallbackUrl(initialUrl));
    const implicit =
      params.has('access_token') ||
      params.has('error') ||
      params.has('error_description') ||
      params.has('error_code');
    const client = createAuthClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: implicit ? 'implicit' : 'pkce',
      },
    });
    authRuntime.client = client;
    client.auth.onAuthStateChange((event, session) => {
      // Sin llamadas asíncronas al SDK dentro del listener (evitar bloqueos de Auth).
      if (event === 'SIGNED_OUT') {
        failedCallback = false;
        recoveryEvent = false;
        clearPasswordFlow();
        authRuntime.session.set(null);
        return;
      }
      if (failedCallback) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        recoveryEvent = true;
        beginPasswordFlow(session, 'recovery');
      } else if (
        event === 'SIGNED_IN' &&
        consumingCallback &&
        callback &&
        kind === 'invite' &&
        session
      ) {
        beginPasswordFlow(session, 'invite');
      } else if (
        authRuntime.passwordFlow() &&
        session?.user.id !== authRuntime.passwordFlow()?.userId
      ) {
        clearPasswordFlow();
      }
      authRuntime.session.set(session);
    });
    const initialized = await client.auth.initialize();
    if (initialized.error) throw initialized.error;
    // Soportar también plantillas de correo que envían token_hash a la raíz del sitio.
    if (params.has('token_hash')) {
      if (!kind || !params.get('token_hash')) throw new Error('Invalid callback');
      const verified = await client.auth.verifyOtp({
        token_hash: params.get('token_hash')!,
        type: kind,
      });
      if (verified.error || !verified.data.session) throw new Error('Invalid callback');
    } else if (callback && hasAuthCallback(new URL(window.location.href))) {
      // PKCE sin verifier (otro navegador) puede restaurar una sesión previa: no aceptarla.
      throw new Error('Unconsumed callback');
    }
    // El SDK publica el resultado de initialize mediante un evento diferido.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const { data, error } = await client.auth.getSession();
    if (error || (callback && !data.session)) throw new Error('Missing session');
    const session = data.session;
    if (!callback && hadFlow && (!savedFlow || !session)) throw new Error('Expired flow');
    const flowKind = recoveryEvent ? 'recovery' : callback ? kind : savedFlow?.kind;
    if (session && flowKind) {
      if (!callback && savedFlow?.userId !== session.user.id) throw new Error('Session mismatch');
      const checked = await client.auth.getUser();
      if (
        checked.error ||
        checked.data.user?.id !== session.user.id ||
        (authRuntime.session() && authRuntime.session()?.user.id !== session.user.id)
      )
        throw new Error('Invalid session');
      if (callback) beginPasswordFlow(session, flowKind);
      else {
        authRuntime.passwordFlow.set(savedFlow);
        authRuntime.recovery.set(true);
        storePasswordFlow(savedFlow);
      }
      destination = '/nueva-contrasena';
    } else {
      clearPasswordFlow();
      destination = session ? '/dashboard' : '/login';
    }
    authRuntime.session.set(session);
  } catch {
    authRuntime.session.set(null);
    if (callback || hadFlow) {
      failedCallback = true;
      authRuntime.passwordFlow.set(null);
      authRuntime.passwordError.set(PASSWORD_LINK_ERROR);
      authRuntime.recovery.set(true);
      storePasswordFlow(null);
      destination = '/nueva-contrasena';
    } else {
      authRuntime.error.set(
        'No se pudo recuperar la sesión. Revisá la conexión y recargá la página.',
      );
    }
  } finally {
    consumingCallback = false;
    if (callback || hadFlow) {
      // Limpiar credenciales también si falló; la pantalla permite solicitar otro enlace.
      window.history.replaceState(null, '', cleanCallbackUrl(initialUrl, destination));
    }
  }
}
