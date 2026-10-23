import type { Session } from '@supabase/supabase-js';
import { AuthClientFactory, authRuntime, clearPasswordFlow, initializeAuth } from './auth-runtime';
import {
  authParameters,
  authRedirectUrl,
  cleanCallbackUrl,
  hasAuthCallback,
  PASSWORD_FLOW_KEY,
  readPasswordFlow,
  storePasswordFlow,
  sdkCallbackUrl,
} from './auth-callback';

describe('Callbacks de invitación y recuperación antes del router hash', () => {
  const factory = vi.fn<AuthClientFactory>();
  const user = { id: 'invitada', email: 'invitada@example.com' };
  const session = { user, access_token: 'test-access', refresh_token: 'test-refresh' } as Session;
  let listener: (event: string, value: Session | null) => void;
  let auth: any;
  let originalUrl: string;
  const location = (suffix: string) =>
    window.history.replaceState(null, '', '/rochi.entrena/' + suffix);
  function callback(suffix: string, event = 'PASSWORD_RECOVERY') {
    location(suffix);
    auth.initialize.mockImplementation(async () => {
      location('');
      setTimeout(() => listener(event, session), 0);
      return { error: null };
    });
  }
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network disabled in unit tests'));
    originalUrl = window.location.href;
    sessionStorage.clear();
    clearPasswordFlow();
    authRuntime.session.set(null);
    authRuntime.error.set('');
    location('#/login');
    auth = {
      onAuthStateChange: vi.fn((fn) => {
        listener = fn;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      initialize: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      verifyOtp: vi.fn().mockImplementation(async ({ type }: { type: string }) => {
        listener(type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', session);
        return { data: { session, user }, error: null };
      }),
    };
    factory.mockReset().mockReturnValue({ auth } as never);
  });
  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    clearPasswordFlow();
    authRuntime.session.set(null);
    authRuntime.error.set('');
    authRuntime.client = null;
    sessionStorage.clear();
    window.history.replaceState(null, '', originalUrl);
    vi.restoreAllMocks();
  });
  it('distingue rutas Angular y conserva la raíz y base-href sin fragmentos en redirectTo', () => {
    expect(hasAuthCallback(new URL('https://example.com/rochi.entrena/#/alumnos'))).toBe(false);
    expect(authRedirectUrl('https://example.com/rochi.entrena/?x=1#/login')).toBe(
      'https://example.com/rochi.entrena/',
    );
    expect(hasAuthCallback(new URL('https://example.com/?token_hash=test&type=invite'))).toBe(true);
    expect(
      authParameters(new URL('https://example.com/?type=recovery#type=invite')).get('type'),
    ).toBe('recovery');
  });
  it.each(['invite', 'recovery'])(
    'dirige el callback implícito %s a crear contraseña después de validar el usuario',
    async (kind) => {
      callback(
        '#access_token=test&refresh_token=test&type=' + kind,
        kind === 'invite' ? 'SIGNED_IN' : 'PASSWORD_RECOVERY',
      );
      await initializeAuth(factory);
      expect(authRuntime.passwordFlow()?.kind).toBe(kind);
      expect(authRuntime.passwordFlow()?.userId).toBe(user.id);
      expect(authRuntime.recovery()).toBe(true);
      expect(auth.getUser).toHaveBeenCalledOnce();
      expect(window.location.hash).toBe('#/nueva-contrasena');
      expect(window.location.href).not.toContain('token=');
      expect(factory).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ auth: expect.objectContaining({ flowType: 'implicit' }) }),
      );
      const marker = sessionStorage.getItem(PASSWORD_FLOW_KEY)!;
      expect(marker).not.toContain(session.access_token);
      expect(marker).not.toContain(session.refresh_token);
    },
  );
  it('separa callbacks de rutas hash antiguas antes de entregarlos al SDK', () => {
    const implicit = new URL(
      sdkCallbackUrl(
        new URL(
          'https://example.com/rochi.entrena/#/login#access_token=test&refresh_token=test&type=invite',
        ),
      ),
    );
    expect(implicit.hash).toBe('#access_token=test&refresh_token=test&type=invite');
    const pkce = new URL(
      sdkCallbackUrl(
        new URL('https://example.com/rochi.entrena/#/nueva-contrasena?code=test&sb_flow_id=flow'),
      ),
    );
    expect(pkce.searchParams.get('code')).toBe('test');
    expect(pkce.searchParams.get('sb_flow_id')).toBe('flow');
    expect(pkce.hash).toBe('');
    const queryTokens = new URL(
      sdkCallbackUrl(
        new URL(
          'https://example.com/rochi.entrena/?access_token=test&refresh_token=test&type=recovery',
        ),
      ),
    );
    expect(queryTokens.search).toBe('');
    expect(queryTokens.hash).toContain('access_token=test');
  });
  it('consume PKCE con el SDK y conserva el evento de recuperación sin type en la URL', async () => {
    callback('?code=test-code&sb_flow_id=test-flow');
    await initializeAuth(factory);
    expect(authRuntime.passwordFlow()?.kind).toBe('recovery');
    expect(window.location.search).toBe('');
    expect(factory).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ auth: expect.objectContaining({ flowType: 'pkce' }) }),
    );
  });
  it('PKCE sin verifier no reutiliza una sesión previa ni habilita actualizar contraseña', async () => {
    location('?code=not-consumed');
    await initializeAuth(factory);
    expect(authRuntime.session()).toBeNull();
    expect(authRuntime.passwordFlow()).toBeNull();
    expect(authRuntime.passwordError()).toContain('enlace');
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain('not-consumed');
  });
  it.each(['invite', 'recovery'])(
    'admite token_hash de tipo %s usando verifyOtp sin crear usuarios',
    async (kind) => {
      location('?token_hash=test-hash&type=' + kind);
      await initializeAuth(factory);
      expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'test-hash', type: kind });
      expect(authRuntime.passwordFlow()?.kind).toBe(kind);
      expect(window.location.search).toBe('');
    },
  );
  it('rechaza token_hash para signup y jamás lo canjea', async () => {
    location('?token_hash=test&type=signup');
    await initializeAuth(factory);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(authRuntime.passwordFlow()).toBeNull();
    expect(authRuntime.passwordError()).toContain('enlace');
  });
  it('limpia errores y tokens aun si el SDK rechaza un enlace usado/vencido', async () => {
    location('#error=access_denied&error_description=private-detail&error_code=otp_expired');
    auth.initialize.mockResolvedValue({ error: { message: 'private-detail' } });
    await initializeAuth(factory);
    expect(window.location.hash).toBe('#/nueva-contrasena');
    expect(window.location.href).not.toContain('private-detail');
    expect(authRuntime.passwordError()).not.toContain('private-detail');
    expect(authRuntime.error()).toBe('');
  });
  it('no habilita el formulario si el usuario del servidor difiere de la sesión', async () => {
    callback('#access_token=test&type=invite', 'SIGNED_IN');
    auth.getUser.mockResolvedValue({ data: { user: { id: 'otra' } }, error: null });
    await initializeAuth(factory);
    expect(authRuntime.session()).toBeNull();
    expect(authRuntime.passwordFlow()).toBeNull();
  });
  it('restaura el contexto al recargar únicamente para la misma identidad y lo valida otra vez', async () => {
    storePasswordFlow({ kind: 'invite', userId: user.id, expiresAt: Date.now() + 60000 });
    location('#/nueva-contrasena');
    await initializeAuth(factory);
    expect(authRuntime.passwordFlow()?.kind).toBe('invite');
    expect(auth.getUser).toHaveBeenCalledOnce();
  });
  it.each(['expired', 'other-user', 'legacy'])(
    'bloquea contexto %s sin convertirlo en sesión ordinaria',
    async (scenario) => {
      if (scenario === 'legacy') sessionStorage.setItem('rochy.auth.recovery', 'true');
      else
        sessionStorage.setItem(
          PASSWORD_FLOW_KEY,
          JSON.stringify({
            kind: 'invite',
            userId: scenario === 'other-user' ? 'otra' : user.id,
            expiresAt: Date.now() + (scenario === 'expired' ? -1 : 60000),
          }),
        );
      await initializeAuth(factory);
      expect(authRuntime.passwordFlow()).toBeNull();
      expect(authRuntime.recovery()).toBe(true);
      expect(authRuntime.passwordError()).toContain('enlace');
    },
  );
  it('una sesión ordinaria o un type sin callback no habilita creación de contraseña', async () => {
    location('?type=invite#/login');
    await initializeAuth(factory);
    expect(authRuntime.recovery()).toBe(false);
    expect(authRuntime.passwordFlow()).toBeNull();
  });
  it('limpia el flujo al salir/cambiar de cuenta y no vuelve a activar la invitación al iniciar sesión después', async () => {
    callback('#access_token=test&type=invite', 'SIGNED_IN');
    await initializeAuth(factory);
    listener('SIGNED_OUT', null);
    expect(readPasswordFlow()).toBeNull();
    expect(authRuntime.recovery()).toBe(false);
    listener('SIGNED_IN', session);
    expect(authRuntime.recovery()).toBe(false);
  });
  it('permite volver a iniciar sesión luego de abandonar un enlace fallido', async () => {
    location('?code=not-consumed');
    await initializeAuth(factory);
    expect(authRuntime.session()).toBeNull();
    listener('SIGNED_OUT', null);
    listener('SIGNED_IN', session);
    expect(authRuntime.session()?.user.id).toBe(user.id);
    expect(authRuntime.recovery()).toBe(false);
    expect(authRuntime.passwordError()).toBe('');
  });
  it('tolera sessionStorage bloqueado sin perder el flujo en memoria', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    callback('#access_token=test&type=recovery');
    await initializeAuth(factory);
    expect(authRuntime.passwordFlow()?.userId).toBe(user.id);
  });
  it('elimina parámetros sensibles en query y fragmento y conserva parámetros inocuos', () => {
    const clean = cleanCallbackUrl(
      new URL(
        'https://example.com/rochi.entrena/?code=secret&token_hash=secret&sb_flow_id=secret&ok=1#access_token=secret',
      ),
      '/nueva-contrasena',
    );
    expect(clean).toBe('/rochi.entrena/?ok=1#/nueva-contrasena');
  });
});
