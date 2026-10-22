import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth-service';
import { authRuntime } from './auth-runtime';
import { SeguridadCuenta, VERIFICADOR_PASSWORD, passwordFuerte } from './seguridad-cuenta';

describe('Cambio de contraseña de cuenta', () => {
  const user = { id: 'u', email: 'prueba@example.com' };
  const actual = 'Anterior!12345',
    nueva = 'NuevaSegura!12345';
  let main: any;
  let verifier: any;
  beforeEach(() => {
    main = {
      rpc: vi
        .fn()
        .mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data: true, error: null }) }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        reauthenticate: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    verifier = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    };
    authRuntime.client = main;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            session: signal({ access_token: 'test', user }),
            recovery: signal(false),
            initializationError: signal(''),
          },
        },
        { provide: VERIFICADOR_PASSWORD, useValue: () => verifier },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    authRuntime.client = null;
  });
  it('verifica contraseña actual y espera confirmación usando current_password sin guardar contraseñas', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const s = TestBed.inject(SeguridadCuenta);
      expect(await s.cambiar(actual, nueva)).toBe(true);
      expect(verifier.auth.signInWithPassword).toHaveBeenCalledWith({
        email: user.email,
        password: actual,
      });
      expect(main.auth.updateUser).toHaveBeenCalledWith({
        password: nueva,
        current_password: actual,
      });
      expect(verifier.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(set).not.toHaveBeenCalled();
      expect(s.mensaje()).toContain('correctamente');
    } finally {
      set.mockRestore();
    }
  });
  it('no actualiza si la contraseña actual es incorrecta o el usuario no es administrador', async () => {
    const s = TestBed.inject(SeguridadCuenta);
    verifier.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials' },
    });
    expect(await s.cambiar(actual, nueva)).toBe(false);
    expect(main.auth.updateUser).not.toHaveBeenCalled();
    expect(s.error()).toContain('actual no es correcta');
    main.rpc.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ data: false, error: null }),
    });
    expect(await s.cambiar(actual, nueva)).toBe(false);
    expect(main.auth.updateUser).not.toHaveBeenCalled();
  });
  it('maneja reautenticación y errores de servidor sin anunciar éxito', async () => {
    const s = TestBed.inject(SeguridadCuenta);
    main.auth.updateUser.mockResolvedValue({
      data: {},
      error: { code: 'reauthentication_needed' },
    });
    expect(await s.cambiar(actual, nueva)).toBe(false);
    expect(s.requiereCodigo()).toBe(true);
    expect(s.mensaje()).toBe('');
    await s.enviarCodigo();
    expect(main.auth.reauthenticate).toHaveBeenCalledOnce();
    main.auth.updateUser.mockResolvedValue({ data: { user }, error: null });
    expect(await s.cambiar(actual, nueva, '123456')).toBe(true);
    expect(main.auth.updateUser).toHaveBeenLastCalledWith({
      password: nueva,
      current_password: actual,
      nonce: '123456',
    });
  });
  it('bloquea duplicados y no publica éxito antes de responder Supabase', async () => {
    let resolve!: (v: any) => void;
    main.auth.updateUser.mockReturnValue(new Promise((r) => (resolve = r)));
    const s = TestBed.inject(SeguridadCuenta);
    const pending = s.cambiar(actual, nueva);
    await vi.waitFor(() => expect(main.auth.updateUser).toHaveBeenCalledOnce());
    expect(await s.cambiar(actual, nueva)).toBe(false);
    expect(s.mensaje()).toBe('');
    resolve({ data: { user }, error: null });
    expect(await pending).toBe(true);
  });
  it('valida fuerza y no envía una contraseña nueva inválida', async () => {
    for (const v of [
      'corta',
      'solominusculas123!',
      'SOLOMAYUSCULAS123!',
      'SinNumeroSeguro!',
      'SinSimbolo12345',
    ])
      expect(passwordFuerte(v)).toBe(false);
    expect(passwordFuerte(nueva)).toBe(true);
    expect(await TestBed.inject(SeguridadCuenta).cambiar(actual, 'corta')).toBe(false);
    expect(main.auth.updateUser).not.toHaveBeenCalled();
  });
});
