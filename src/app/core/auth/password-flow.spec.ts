import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { AuthService, authError } from './auth-service';
import { authRuntime, clearPasswordFlow } from './auth-runtime';
import { storePasswordFlow, PASSWORD_FLOW_KEY } from './auth-callback';

describe('Creación y recuperación de contraseña: servicio', () => {
  const user = { id: 'invitada', email: 'invitada@example.com' };
  const session = { user, access_token: 'test-session' } as Session;
  const password = 'ClaveNueva!12345';
  let client: any;
  beforeEach(() => {
    clearPasswordFlow();
    authRuntime.session.set(session);
    authRuntime.recovery.set(true);
    authRuntime.error.set('');
    const flow = { kind: 'invite' as const, userId: user.id, expiresAt: Date.now() + 60000 };
    authRuntime.passwordFlow.set(flow);
    storePasswordFlow(flow);
    client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    authRuntime.client = client;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    clearPasswordFlow();
    authRuntime.session.set(null);
    authRuntime.error.set('');
    authRuntime.client = null;
    vi.restoreAllMocks();
  });
  it('solicita correo con redirectTo de la raíz sin hash y sin crear usuarios', async () => {
    await TestBed.inject(AuthService).requestRecovery(' invitada@example.com ');
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('invitada@example.com', {
      redirectTo: expect.any(String),
    });
    const redirect = new URL(client.auth.resetPasswordForEmail.mock.calls[0][1].redirectTo);
    expect(redirect.hash).toBe('');
    expect(redirect.search).toBe('');
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
  it('no oculta error de correo ni filtra el mensaje interno en traducciones', async () => {
    client.auth.resetPasswordForEmail.mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'private' },
    });
    await expect(TestBed.inject(AuthService).requestRecovery(user.email)).rejects.toMatchObject({
      code: 'over_email_send_rate_limit',
    });
    expect(authError({ code: 'over_email_send_rate_limit', message: 'private' })).toContain(
      'Demasiados',
    );
    expect(authError({ message: 'private' })).not.toContain('private');
  });
  it('verifica identidad en el servidor antes de enviar exclusivamente password y espera su confirmación', async () => {
    const auth = TestBed.inject(AuthService);
    let resolve!: (value: any) => void;
    client.auth.updateUser.mockReturnValue(new Promise((r) => (resolve = r)));
    const operation = auth.changePassword(password);
    await vi.waitFor(() => expect(client.auth.updateUser).toHaveBeenCalled());
    expect(client.auth.getSession).toHaveBeenCalledOnce();
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password });
    expect(client.auth.signOut).not.toHaveBeenCalled();
    resolve({ data: { user }, error: null });
    await operation;
  });
  it.each(['ordinary', 'expired', 'wrong-user', 'error'])(
    'rechaza sesión %s sin enviar contraseña',
    async (scenario) => {
      if (scenario === 'ordinary') clearPasswordFlow();
      if (scenario === 'expired')
        authRuntime.passwordFlow.update((f) => ({ ...f!, expiresAt: Date.now() - 1 }));
      if (scenario === 'wrong-user')
        client.auth.getUser.mockResolvedValue({ data: { user: { id: 'otra' } }, error: null });
      if (scenario === 'error')
        client.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: { code: 'session_not_found' },
        });
      await expect(TestBed.inject(AuthService).changePassword(password)).rejects.toMatchObject({
        code: 'invalid_password_session',
      });
      expect(client.auth.updateUser).not.toHaveBeenCalled();
    },
  );
  it('rechaza cambio de cuenta mientras espera la verificación del servidor', async () => {
    let resolve!: (v: any) => void;
    client.auth.getUser.mockReturnValue(new Promise((r) => (resolve = r)));
    const op = TestBed.inject(AuthService).changePassword(password);
    await vi.waitFor(() => expect(client.auth.getUser).toHaveBeenCalled());
    authRuntime.session.set({ user: { id: 'otra' } } as Session);
    resolve({ data: { user }, error: null });
    await expect(op).rejects.toMatchObject({ code: 'invalid_password_session' });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
  it.each([
    'corta',
    'minusculas!123456',
    'MAYUSCULAS!12345',
    'SinNumeros!Clave',
    'SinSimbolos123456',
  ])('rechaza contraseña débil %s sin llamar al servidor', async (value) => {
    await expect(TestBed.inject(AuthService).changePassword(value)).rejects.toMatchObject({
      code: 'password_policy',
    });
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
  it('no confirma un update vacío o rechazado y conserva el contexto para reintentar', async () => {
    client.auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'weak_password' },
    });
    await expect(TestBed.inject(AuthService).changePassword(password)).rejects.toMatchObject({
      code: 'weak_password',
    });
    expect(authRuntime.recovery()).toBe(true);
    client.auth.updateUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(TestBed.inject(AuthService).changePassword(password)).rejects.toMatchObject({
      code: 'invalid_password_session',
    });
  });
  it('limpia el contexto solo si se confirma el cierre local y no cierra sesiones ajenas', async () => {
    const auth = TestBed.inject(AuthService);
    client.auth.signOut.mockResolvedValue({ error: new Error('offline') });
    await expect(auth.signOut()).rejects.toThrow();
    expect(authRuntime.recovery()).toBe(true);
    expect(sessionStorage.getItem(PASSWORD_FLOW_KEY)).not.toBeNull();
    client.auth.signOut.mockResolvedValue({ error: null });
    await auth.signOut();
    expect(client.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(authRuntime.session()).toBeNull();
    expect(authRuntime.passwordFlow()).toBeNull();
    expect(sessionStorage.getItem(PASSWORD_FLOW_KEY)).toBeNull();
  });
});
