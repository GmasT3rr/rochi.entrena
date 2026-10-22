import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { authRuntime, hasAuthCallback } from './auth-runtime';
import { sessionGuard } from './auth-guard';
import { AuthService, authError } from './auth-service';
import { AdminAuthorization } from './admin-authorization';

describe('Autenticación preliminar', () => {
  beforeEach(() => {
    authRuntime.session.set(null);
    authRuntime.recovery.set(false);
    authRuntime.error.set('');
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    authRuntime.session.set(null);
    authRuntime.recovery.set(false);
    authRuntime.error.set('');
    authRuntime.client = null;
  });
  const guard = () => TestBed.runInInjectionContext(() =>
    sessionGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('redirige al login sin sesión sin consultar permisos', async () => {
    expect(TestBed.inject(Router).serializeUrl(await guard() as never)).toBe('/login');
  });
  it('bloquea las rutas durante recuperación y ante errores de inicialización', async () => {
    authRuntime.session.set({ user: { id: 'test' } } as Session);
    authRuntime.recovery.set(true);
    expect(await guard()).not.toBe(true);
    authRuntime.recovery.set(false);
    authRuntime.error.set('Error');
    expect(await guard()).not.toBe(true);
  });
  const session = (token = 'test-session') => authRuntime.session.set({ access_token: token, user: { id: token } } as Session);
  function rpcResult(data: unknown, error: unknown = null) {
    const abortSignal = vi.fn().mockResolvedValue({ data, error });
    const rpc = vi.fn().mockReturnValue({ abortSignal });
    authRuntime.client = { rpc } as never;
    return rpc;
  }
  it('permite al administrador solamente con un booleano true explícito', async () => {
    session();
    const rpc = rpcResult(true);
    expect(await guard()).toBe(true);
    expect(rpc).toHaveBeenCalledWith('es_administrador_actual');
    expect(TestBed.inject(AdminAuthorization).status()).toBe('authorized');
  });
  it.each(['no administrador', 'administrador desactivado'])('rechaza %s', async () => {
    session(); rpcResult(false);
    expect(TestBed.inject(Router).serializeUrl(await guard() as never)).toBe('/acceso-no-autorizado');
    expect(TestBed.inject(AdminAuthorization).status()).toBe('denied');
  });
  it.each([null, [], {}, 'true', 1])('no acepta respuestas vacías o ambiguas: %j', async data => {
    session(); rpcResult(data);
    expect(await guard()).not.toBe(true);
    expect(TestBed.inject(AdminAuthorization).status()).toBe('error');
  });
  it('falla cerrado si la RPC falla o no existe', async () => {
    session(); rpcResult(null, { code: 'PGRST202' });
    expect(await guard()).not.toBe(true);
  });
  it('falla cerrado ante error de red', async () => {
    session();
    authRuntime.client = { rpc: () => ({ abortSignal: () => Promise.reject(new Error('offline')) }) } as never;
    expect(await guard()).not.toBe(true);
  });
  it('retira el acceso anterior si la siguiente comprobación pierde la conexión', async () => {
    session(); const rpc = rpcResult(true);
    expect(await guard()).toBe(true);
    rpc.mockReturnValue({ abortSignal: () => Promise.reject(new Error('offline')) });
    expect(TestBed.inject(Router).serializeUrl(await guard() as never)).toBe('/acceso-no-autorizado');
    expect(TestBed.inject(AdminAuthorization).status()).toBe('error');
  });
  it('deniega cuando se aborta la solicitud y exige un límite de diez segundos', async () => {
    session();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      authRuntime.client = { rpc: () => ({ abortSignal: (signal: AbortSignal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      }) }) } as never;
      const result = guard();
      expect(TestBed.inject(AdminAuthorization).status()).toBe('checking');
      expect(timeout).toHaveBeenCalledWith(10000);
      controller.abort();
      expect(await result).not.toBe(true);
      expect(TestBed.inject(AdminAuthorization).status()).toBe('error');
    } finally { timeout.mockRestore(); }
  });
  it('vuelve a consultar al navegar y detecta una baja administrativa con la misma sesión', async () => {
    session(); const rpc = rpcResult(true);
    expect(await guard()).toBe(true);
    rpc.mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data: false, error: null }) });
    expect(await guard()).not.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('bloquea mientras espera e ignora una respuesta de una sesión anterior', async () => {
    session();
    let resolve!: (result: unknown) => void;
    const pending = new Promise(r => resolve = r);
    authRuntime.client = { rpc: () => ({ abortSignal: () => pending }) } as never;
    const request = guard();
    expect(TestBed.inject(AdminAuthorization).status()).toBe('checking');
    session('other-session');
    resolve({ data: true, error: null });
    expect(await request).not.toBe(true);
    expect(TestBed.inject(AdminAuthorization).status()).toBe('unchecked');
  });
  it('distingue callbacks de las rutas hash y conserva ambos formatos de Auth', () => {
    expect(hasAuthCallback(new URL('https://example.org/rochi.entrena/#/alumnos'))).toBe(false);
    expect(hasAuthCallback(new URL('https://example.org/rochi.entrena/?code=test'))).toBe(true);
    expect(hasAuthCallback(new URL('https://example.org/rochi.entrena/#access_token=test&refresh_token=test'))).toBe(true);
    expect(hasAuthCallback(new URL('https://example.org/#error_description=expired'))).toBe(true);
  });
  it('traduce errores sin exponer mensajes internos', () => {
    expect(authError({ code: 'invalid_credentials' })).toContain('incorrectos');
    expect(authError(new Error('secret internal error'))).not.toContain('secret');
  });
  it('propaga el error de cierre sin fingir que la sesión se cerró', async () => {
    const failure = new Error('offline');
    authRuntime.client = { auth: { signOut: vi.fn().mockResolvedValue({ error: failure }) } } as never;
    await expect(TestBed.inject(AuthService).signOut()).rejects.toThrow('offline');
  });
});
