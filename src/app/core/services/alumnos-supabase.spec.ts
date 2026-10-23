import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { AlumnosSupabaseRepository, mapearAlumno } from './alumnos-supabase-repository';
import { AlumnosService } from './alumnos-service';
import { AlumnosLocalService } from './alumnos-local-service';
import { ALUMNOS_STORAGE_KEY } from './alumnos-repository';
import { CUENTAS_STORAGE_KEY } from './cuentas-repository';
import { DATOS_STORAGE_KEY } from './datos-repository';
import { CuentasLocalesService as CuentasService } from './cuentas-locales-service';

const fila = {
  id: 'id-historico',
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: '',
  email: '',
  modalidad: 'Online',
  estado: 'Activo',
  fecha_ingreso: '2026-10-01',
  observaciones: '',
  proxima_cuota_original: '2026-11-01',
  configuracion_mensual: { habilitada: true, importe: 10000, dia_vencimiento: 31 },
};
const alumno = mapearAlumno(fila);
function authMock() {
  return {
    session: signal<any>({ access_token: 'test' }),
    recovery: signal(false),
    initializationError: signal(''),
  };
}

describe('Repositorio Supabase de alumnos', () => {
  const verify = vi.fn();
  const rpc = vi.fn();
  const from = vi.fn();
  let auth: ReturnType<typeof authMock>;
  beforeEach(() => {
    verify.mockReset().mockResolvedValue(true);
    rpc.mockReset();
    from.mockReset();
    auth = authMock();
    authRuntime.client = { rpc, from } as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AdminAuthorization, useValue: { verify } },
      ],
    });
  });
  afterEach(() => {
    authRuntime.client = null;
    TestBed.resetTestingModule();
  });
  it('mapea columnas, ID y configuración deshabilitada sin perder valores', () => {
    expect(alumno.id).toBe(fila.id);
    expect(alumno.fechaIngreso).toBe(fila.fecha_ingreso);
    expect(
      mapearAlumno({
        ...fila,
        configuracion_mensual: { ...fila.configuracion_mensual, habilitada: false },
      }).configuracionMensual,
    ).toEqual({ habilitada: false, importe: 10000, diaVencimiento: 31 });
    expect(
      mapearAlumno({ ...fila, configuracion_mensual: null }).configuracionMensual,
    ).toBeUndefined();
  });
  it('envía alta/edición en una sola RPC sin credenciales ni tablas financieras', async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: fila, error: null }) });
    expect(await TestBed.inject(AlumnosSupabaseRepository).guardar(alumno, false)).toEqual(alumno);
    expect(rpc).toHaveBeenCalledWith(
      'guardar_alumno_con_configuracion',
      expect.objectContaining({
        p_id: fila.id,
        p_crear: false,
        p_datos: expect.objectContaining({
          fecha_ingreso: fila.fecha_ingreso,
          configuracion_mensual: { habilitada: true, importe: 10000, dia_vencimiento: 31 },
        }),
      }),
    );
    expect(from).not.toHaveBeenCalled();
  });
  it('no ejecuta consultas sin sesión o autorización', async () => {
    auth.session.set(null);
    await expect(TestBed.inject(AlumnosSupabaseRepository).listar()).rejects.toMatchObject({
      code: '42501',
    });
    auth.session.set({ access_token: 'test' });
    verify.mockResolvedValue(false);
    await expect(
      TestBed.inject(AlumnosSupabaseRepository).guardar(alumno, true),
    ).rejects.toMatchObject({ code: '42501' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('no acepta éxito vacío ni oculta errores de la RPC', async () => {
    rpc.mockReturnValue({
      abortSignal: () => Promise.resolve({ data: null, error: { code: '23514' } }),
    });
    await expect(
      TestBed.inject(AlumnosSupabaseRepository).guardar(alumno, true),
    ).rejects.toMatchObject({ code: '23514' });
    rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: null, error: null }) });
    await expect(TestBed.inject(AlumnosSupabaseRepository).guardar(alumno, true)).rejects.toThrow();
  });
  it('pagina sin truncar por el máximo del servidor y no confunde vacío con mocks', async () => {
    const responses = [[fila], []];
    const builder: any = {};
    for (const method of ['select', 'order', 'range'])
      builder[method] = vi.fn().mockReturnValue(builder);
    builder.abortSignal = vi.fn().mockImplementation(() => {
      const data = responses.shift();
      return Promise.resolve({ data, error: null, count: data?.length ? 2 : 0 });
    });
    from.mockReturnValue(builder);
    responses[1] = [fila];
    expect(await TestBed.inject(AlumnosSupabaseRepository).listar()).toEqual([alumno, alumno]);
    expect(builder.range.mock.calls).toEqual([
      [0, 499],
      [1, 500],
    ]);
    responses.push([]);
    expect(await TestBed.inject(AlumnosSupabaseRepository).listar()).toEqual([]);
  });
  it('obtiene por ID y cambia estado requiriendo una fila confirmada', async () => {
    const builder: any = {};
    for (const method of ['select', 'update', 'eq', 'abortSignal'])
      builder[method] = vi.fn().mockReturnValue(builder);
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: fila, error: null });
    builder.single = vi
      .fn()
      .mockResolvedValue({ data: { ...fila, estado: 'Inactivo' }, error: null });
    from.mockReturnValue(builder);
    const repo = TestBed.inject(AlumnosSupabaseRepository);
    expect((await repo.obtener(fila.id))?.id).toBe(fila.id);
    expect((await repo.cambiarEstado(fila.id, 'Inactivo')).estado).toBe('Inactivo');
    expect(builder.update).toHaveBeenCalledWith({ estado: 'Inactivo' });
  });
});

describe('Signals remotos y aislamiento de finanzas locales', () => {
  let repo: {
    listar: ReturnType<typeof vi.fn>;
    guardar: ReturnType<typeof vi.fn>;
    cambiarEstado: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    repo = {
      listar: vi.fn().mockResolvedValue([]),
      guardar: vi.fn().mockImplementation(async (a) => a),
      cambiarEstado: vi.fn(),
    };
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock() },
        { provide: AlumnosSupabaseRepository, useValue: repo },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });
  it('carga vacío sin mocks y conserva las claves locales byte a byte', async () => {
    for (const key of [ALUMNOS_STORAGE_KEY, CUENTAS_STORAGE_KEY, DATOS_STORAGE_KEY])
      localStorage.setItem(key, 'datos previos sin tocar');
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    expect(service.alumnos()).toEqual([]);
    const { id, ...datos } = alumno;
    expect(await service.guardar(datos)).toBe(true);
    for (const key of [ALUMNOS_STORAGE_KEY, CUENTAS_STORAGE_KEY, DATOS_STORAGE_KEY])
      expect(localStorage.getItem(key)).toBe('datos previos sin tocar');
  });
  it('publica solo tras confirmar, edita y conserva el ID tras recargar', async () => {
    repo.listar.mockResolvedValue([alumno]);
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    let resolve!: (a: typeof alumno) => void;
    repo.guardar.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = service.guardar({ ...alumno, nombre: 'Editada' }, alumno.id);
    expect(service.guardando()).toBe(true);
    expect(service.alumnos()[0].nombre).toBe('Ana');
    resolve({ ...alumno, nombre: 'Editada' });
    expect(await pending).toBe(true);
    repo.listar.mockResolvedValue([{ ...alumno, nombre: 'Editada' }]);
    await service.recargar();
    expect(service.alumnos()[0]).toMatchObject({ id: fila.id, nombre: 'Editada' });
    repo.cambiarEstado.mockResolvedValue({ ...alumno, estado: 'Inactivo' });
    expect(await service.cambiarEstado(alumno.id, 'Inactivo')).toBe(true);
    expect(service.alumnos()[0].estado).toBe('Inactivo');
  });
  it('mantiene memoria sin éxito ante fallos de red y permite reintentar', async () => {
    repo.listar.mockResolvedValue([alumno]);
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    repo.guardar.mockRejectedValue(new Error('offline'));
    expect(await service.guardar(alumno, alumno.id)).toBe(false);
    expect(service.alumnos()).toEqual([alumno]);
    expect(service.error()).toBeTruthy();
    expect(service.mensaje()).toBe('');
    repo.listar.mockRejectedValue(new Error('offline'));
    await service.recargar();
    expect(service.alumnos()).toEqual([alumno]);
    expect(service.cargando()).toBe(false);
    expect(service.errorListado()).toBeTruthy();
  });
  it('no confunde RPC faltante con error de listado ni con datos vacíos por fallo', async () => {
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    repo.guardar.mockRejectedValue({ code: 'PGRST202' });
    expect(await service.guardar(alumno)).toBe(false);
    expect(service.error()).toContain('No pudimos');
    expect(service.errorListado()).toBe('');
    repo.listar.mockRejectedValue({ code: 'PGRST200' });
    await service.recargar();
    expect(service.errorListado()).toContain('No pudimos');
  });
  it('evita refrescos innecesarios, conserva filtros y renueva datos vencidos', async () => {
    repo.listar.mockResolvedValue([alumno]);
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    const reloj = vi.spyOn(Date, 'now');
    const ahora = Date.now();
    service.filtros.busqueda.set('Ana');
    service.filtros.modalidad.set('Online');
    repo.listar.mockClear();
    service.refrescarSiNecesario();
    expect(repo.listar).not.toHaveBeenCalled();
    reloj.mockReturnValue(ahora + 61000);
    let resolver!: (datos: (typeof alumno)[]) => void;
    repo.listar.mockReturnValue(new Promise((r) => (resolver = r)));
    service.refrescarSiNecesario();
    service.refrescarSiNecesario();
    expect(repo.listar).toHaveBeenCalledTimes(1);
    expect(service.alumnos()).toEqual([alumno]);
    resolver([{ ...alumno, nombre: 'Renovada' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(service.alumnos()[0].nombre).toBe('Renovada');
    expect(service.filtros.busqueda()).toBe('Ana');
    expect(service.filtros.modalidad()).toBe('Online');
    reloj.mockRestore();
  });
  it('reactiva sin consulta extra y elimina cache cuando se deniega acceso', async () => {
    repo.listar.mockResolvedValue([alumno]);
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    repo.cambiarEstado.mockResolvedValue({ ...alumno, estado: 'Activo' });
    expect(await service.cambiarEstado(alumno.id, 'Activo')).toBe(true);
    expect(service.alumnos()[0].estado).toBe('Activo');
    repo.listar.mockRejectedValue({ code: '42501' });
    await service.recargar();
    expect(service.alumnos()).toEqual([]);
    expect(service.listadoCargado()).toBe(false);
    expect(service.errorListado()).toContain('Acceso denegado');
  });
  it('guarda configuración habilitada y deshabilitada conservando valores', async () => {
    repo.listar.mockResolvedValue([alumno]);
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    expect(
      await service.configurarMensual(alumno.id, {
        habilitada: true,
        importe: 20000,
        diaVencimiento: 20,
      }),
    ).toBe(true);
    expect(
      await service.configurarMensual(alumno.id, {
        habilitada: false,
        importe: 20000,
        diaVencimiento: 20,
      }),
    ).toBe(true);
    expect(service.alumnos()[0].configuracionMensual).toEqual({
      habilitada: false,
      importe: 20000,
      diaVencimiento: 20,
    });
  });
  it('no une por ID los alumnos remotos a cuotas o generación mensual locales', async () => {
    const local = { ...alumno, configuracionMensual: undefined };
    localStorage.setItem(ALUMNOS_STORAGE_KEY, JSON.stringify([local]));
    localStorage.setItem(
      CUENTAS_STORAGE_KEY,
      JSON.stringify({ version: 1, cuotas: [], pagos: [] }),
    );
    repo.listar.mockResolvedValue([{ ...alumno, nombre: 'Remota' }]);
    await TestBed.inject(AlumnosService).recargar();
    expect(TestBed.inject(AlumnosLocalService).alumnos()[0].nombre).toBe('Ana');
    expect(TestBed.inject(CuentasService).previsualizarMensual('2026-11').cuotas).toEqual([]);
    expect(JSON.parse(localStorage.getItem(ALUMNOS_STORAGE_KEY)!)[0].nombre).toBe('Ana');
  });
});
