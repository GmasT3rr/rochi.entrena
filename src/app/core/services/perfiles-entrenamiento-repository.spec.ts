import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { PerfilesEntrenamientoRepository } from './perfiles-entrenamiento-repository';
import { perfilVacio } from '../perfil-entrenamiento';
import { PerfilCargaError } from './perfil-carga-error';

const fila = {
  ...perfilVacio(),
  id: 'id',
  alumno_id: 'a',
  propietario_id: 'owner',
  creado_en: '2026-10-28T10:00:00Z',
  actualizado_en: '2026-10-28T10:00:00Z',
  ciudad: 'Rosario',
  realiza_cardio: false,
};
describe('Repositorio de perfiles: SDK simulado, no RLS real', () => {
  const session = signal<any>({ access_token: 'token', user: { id: 'owner' } });
  const verify = vi.fn(),
    from = vi.fn(),
    rpc = vi.fn(),
    maybeSingle = vi.fn(),
    abortSignal = vi.fn();
  let repo: PerfilesEntrenamientoRepository;
  beforeEach(() => {
    for (const fn of [verify, from, rpc, maybeSingle, abortSignal]) fn.mockReset();
    session.set({ access_token: 'token', user: { id: 'owner' } });
    verify.mockResolvedValue(true);
    const query: any = {};
    for (const key of ['select', 'eq', 'abortSignal']) query[key] = vi.fn(() => query);
    query.maybeSingle = maybeSingle;
    from.mockReturnValue(query);
    maybeSingle.mockResolvedValue({ data: fila, error: null });
    rpc.mockReturnValue({ abortSignal });
    abortSignal.mockResolvedValue({ data: fila, error: null });
    authRuntime.client = { from, rpc } as never;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { session, recovery: signal(false), initializationError: signal('') },
        },
        { provide: AdminAuthorization, useValue: { verify } },
      ],
    });
    repo = TestBed.inject(PerfilesEntrenamientoRepository);
  });
  afterEach(() => {
    authRuntime.client = null;
  });
  it('consulta por alumno y conserva valores opcionales; una nueva lectura recupera lo persistido', async () => {
    expect((await repo.obtener('a'))?.realiza_cardio).toBe(false);
    expect(from).toHaveBeenCalledWith('perfiles_entrenamiento');
    expect(from.mock.results[0].value.eq).toHaveBeenCalledWith('alumno_id', 'a');
    expect(from.mock.results[0].value.eq).toHaveBeenCalledWith('propietario_id', 'owner');
    const datos = { ...perfilVacio(), ciudad: 'Rosario', realiza_cardio: false };
    await repo.guardar('a', datos, fila.actualizado_en);
    expect(rpc).toHaveBeenCalledWith('guardar_perfil_entrenamiento', {
      p_alumno: 'a',
      p_datos: datos,
      p_version: fila.actualizado_en,
    });
    expect((await repo.obtener('a'))?.ciudad).toBe('Rosario');
  });
  it('distingue ausencia real de fallo o respuesta incompleta, sin crear un perfil vacío', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.obtener('a')).toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(repo.obtener('a')).rejects.toThrow('cargar');
    maybeSingle.mockResolvedValueOnce({ data: { alumno_id: 'a' }, error: null });
    await expect(repo.obtener('a')).rejects.toThrow('respuesta');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('envía la versión sin perder microsegundos ni convertirla a Date', async () => {
    const version = '2026-10-28T10:00:00.123456+00:00';
    await repo.guardar('a', perfilVacio(), version);
    expect(rpc).toHaveBeenCalledWith(
      'guardar_perfil_entrenamiento',
      expect.objectContaining({ p_version: version }),
    );
  });
  it('rechaza respuestas de otro alumno y snapshots incompletos antes de guardar', async () => {
    await expect(repo.obtener('b')).rejects.toThrow('respuesta');
    maybeSingle.mockResolvedValueOnce({
      data: { ...fila, propietario_id: 'otro-propietario' },
      error: null,
    });
    await expect(repo.obtener('a')).rejects.toThrow('respuesta');
    await expect(repo.guardar('a', {} as never, null)).rejects.toThrow('Faltan');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('no guarda con permisos denegados y descarta una lectura de la sesión anterior', async () => {
    verify.mockResolvedValueOnce(false);
    await expect(repo.guardar('a', perfilVacio(), null)).rejects.toThrow('permisos');
    expect(rpc).not.toHaveBeenCalled();
    maybeSingle.mockImplementationOnce(async () => {
      session.set(null);
      return { data: fila, error: null };
    });
    await expect(repo.obtener('a')).rejects.toThrow('sesión');
  });
  it.each([
    [404, 'PGRST205'],
    [403, '42501'],
    [0, ''],
    [406, 'PGRST116'],
  ])('conserva HTTP %s y código %s sin filtrar detalles sensibles', async (status, codigo) => {
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: {
        code: codigo,
        message: 'Bearer token-secreto correo@ejemplo.com',
        details: 'datos sensibles del alumno',
      },
      status,
    });
    let recibido: unknown;
    try {
      await repo.obtener('a');
    } catch (e) {
      recibido = e;
    }
    expect(recibido).toBeInstanceOf(PerfilCargaError);
    const d = (recibido as PerfilCargaError).diagnostico;
    expect(d.http).toBe(status || null);
    expect(d.codigo).toBe(codigo || 'TCF_RED');
    expect(d.solicitud).toContain('alumno_id=eq.[alumno]');
    expect(JSON.stringify(d)).not.toMatch(/token-secreto|correo@ejemplo.com|datos sensibles/);
  });
  it('informa conflicto o fallo de guardado sin afirmar éxito', async () => {
    abortSignal.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    await expect(repo.guardar('a', perfilVacio(), null)).rejects.toThrow('otra sesión');
    abortSignal.mockResolvedValueOnce({ data: null, error: { code: 'network' } });
    await expect(repo.guardar('a', perfilVacio(), null)).rejects.toThrow('reintentar');
  });
});
