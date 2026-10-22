import { signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './supabase.config';

export const authRuntime = {
  session: signal<Session | null>(null),
  recovery: signal(false),
  error: signal(''),
  client: null as SupabaseClient | null,
};

export function hasAuthCallback(url: URL): boolean {
  const fragment = new URLSearchParams(url.hash.slice(1));
  return url.searchParams.has('code') || url.searchParams.has('error') ||
    fragment.has('access_token') || fragment.has('refresh_token') || fragment.has('error_description');
}

/** Se ejecuta ANTES del router: el SDK es el único que lee/intercambia tokens. */
export async function initializeAuth(): Promise<void> {
  if (!supabaseConfig.url || !supabaseConfig.publishableKey) {
    authRuntime.error.set('Falta configurar la URL y la publishable key de Supabase.');
    return;
  }
  try {
    if (!supabaseConfig.publishableKey.startsWith('sb_publishable_')) {
      throw new Error('Invalid public configuration');
    }
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const implicitCallback = fragment.has('access_token') || fragment.has('error_description');
    const client = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: implicitCallback ? 'implicit' : 'pkce' },
    });
    authRuntime.client = client;
    client.auth.onAuthStateChange((event, session) => {
      authRuntime.session.set(session);
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('rochy.auth.recovery', 'true');
        authRuntime.recovery.set(true);
      }
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('rochy.auth.recovery');
        authRuntime.recovery.set(false);
      }
    });
    const initialized = await client.auth.initialize();
    if (initialized.error) throw initialized.error;
    // El SDK emite PASSWORD_RECOVERY en el siguiente turno tras inicializar.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const { data, error } = await client.auth.getSession();
    if (error) {
      authRuntime.error.set('No se pudo recuperar la sesión o el enlace venció. Volvé a iniciar sesión o solicitá otro enlace.');
      return;
    }
    authRuntime.session.set(data.session);
    if (data.session && sessionStorage.getItem('rochy.auth.recovery')) authRuntime.recovery.set(true);
    if (authRuntime.recovery()) {
      // El SDK ya consumió el callback. Nunca reescribir la URL antes de getSession().
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/login`);
    }
  } catch {
    authRuntime.error.set('No se pudo inicializar Supabase. Revisá la configuración y la conexión.');
  }
}
