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
import { fechaArgentina } from './cuentas-remotas-service';
import { ToastService } from './toast-service';

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
  it('envía un solo guardado conjunto con versiones sin pérdida y mapea ambas respuestas', async () => {
    const actualizado = '2026-10-28T12:00:00.123456+00:00';
    rpc.mockReturnValue({
      abortSignal: () =>
        Promise.resolve({
          data: {
            alumno: {
              ...fila,
              configuracion_mensual: {
                ...fila.configuracion_mensual,
                importe: 20000,
                actualizado_en: actualizado,
              },
            },
            cuentas: { version: 1, alumnos: [fila], cuotas: [], pagos: [], cobros_directos: [] },
          },
          error: null,
          status: 200,
        }),
    });
    const repo = TestBed.inject(AlumnosSupabaseRepository);
    const resultado = await repo.ajustarMensual(
      fila.id,
      { habilitada: true, importe: 20000, diaVencimiento: 31, periodoInicio: '2026-01' },
      {
        periodo: '2026-10',
        cuotaId: 'c',
        versionConfiguracion: actualizado,
        versionCuota: { actualizadoEn: actualizado, revision: '9007199254740993' },
      },
    );
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('ajustar_configuracion_y_cuota_actual', {
      p_alumno: fila.id,
      p_configuracion: {
        habilitada: true,
        importe: 20000,
        dia_vencimiento: 31,
        periodo_inicio: '2026-01',
      },
      p_periodo: '2026-10',
      p_version_configuracion: actualizado,
      p_cuota: 'c',
      p_actualizado_cuota: actualizado,
      p_revision_cuota: '9007199254740993',
    });
    expect(resultado.alumno.configuracionMensual?.actualizadoEn).toBe(actualizado);
    expect(resultado.cuentas.version).toBe(1);
    expect(from).not.toHaveBeenCalled();
  });
  it('lee y persiste el inicio mensual sin crear cuotas en una edición', async () => {
    const probe: any = {};
    for (const method of ['select', 'limit']) probe[method] = vi.fn().mockReturnValue(probe);
    probe.abortSignal = vi.fn().mockResolvedValue({ data: [], error: null, status: 200 });
    from.mockReturnValue(probe);
    const guardado = mapearAlumno({
      ...fila,
      configuracion_mensual: { ...fila.configuracion_mensual, periodo_inicio: '2028-02-01' },
    });
    expect(guardado.configuracionMensual?.periodoInicio).toBe('2028-02');
    rpc.mockReturnValue({
      abortSignal: () =>
        Promise.resolve({
          data: {
            ...fila,
            configuracion_mensual: { ...fila.configuracion_mensual, periodo_inicio: '2028-02-01' },
          },
          error: null,
        }),
    });
    await TestBed.inject(AlumnosSupabaseRepository).guardar(guardado, false);
    expect(rpc).toHaveBeenCalledWith(
      'guardar_alumno_con_configuracion',
      expect.objectContaining({
        p_crear: false,
        p_datos: expect.objectContaining({
          configuracion_mensual: expect.objectContaining({ periodo_inicio: '2028-02' }),
        }),
      }),
    );
    expect(from).toHaveBeenCalledWith('configuraciones_mensuales');
  });
  it('lee alumnos y fichas sin exigir la columna opcional de la migración pendiente', async () => {
    const builder: any = {};
    for (const method of ['select', 'order', 'range', 'eq'])
      builder[method] = vi.fn().mockReturnValue(builder);
    builder.abortSignal = vi
      .fn()
      .mockResolvedValue({ data: [fila], error: null, count: 1, status: 200 });
    from.mockReturnValue(builder);
    const repo = TestBed.inject(AlumnosSupabaseRepository);
    expect(await repo.listar()).toEqual([alumno]);
    const seleccion = builder.select.mock.calls[0][0] as string;
    expect(seleccion).toContain('configuraciones_mensuales_alumno_id_fkey(*)');
    expect(seleccion).not.toContain('periodo_inicio');
    builder.abortSignal.mockReturnValue({
      maybeSingle: () => Promise.resolve({ data: fila, error: null, status: 200 }),
    });
    expect(await repo.obtener(fila.id)).toEqual(alumno);
    builder.abortSignal.mockReturnValue({
      single: () =>
        Promise.resolve({ data: { ...fila, estado: 'Inactivo' }, error: null, status: 200 }),
    });
    builder.update = vi.fn().mockReturnValue(builder);
    expect((await repo.cambiarEstado(fila.id, 'Inactivo')).estado).toBe('Inactivo');
    expect(builder.select.mock.calls.every(([s]: [string]) => !s.includes('periodo_inicio'))).toBe(
      true,
    );
  });
  it('preserva el código, mensaje, operación y HTTP de un fallo real de lectura', async () => {
    const builder: any = {};
    for (const method of ['select', 'order', 'range'])
      builder[method] = vi.fn().mockReturnValue(builder);
    builder.abortSignal = vi.fn().mockResolvedValue({
      data: null,
      count: null,
      error: { code: '42501', message: 'permission denied for table alumnos' },
      status: 403,
    });
    from.mockReturnValue(builder);
    await expect(TestBed.inject(AlumnosSupabaseRepository).listar()).rejects.toMatchObject({
      code: '42501',
      message: 'permission denied for table alumnos',
      status: 403,
      operacion: 'Listar alumnos',
      recurso: 'alumnos / configuraciones_mensuales',
    });
  });
  it('mantiene el guardado mensual anterior sin perder el período de la primera cuota', async () => {
    const builder: any = {};
    for (const method of ['select', 'limit']) builder[method] = vi.fn().mockReturnValue(builder);
    builder.abortSignal = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42703',
        message: 'column configuraciones_mensuales.periodo_inicio does not exist',
      },
      status: 400,
    });
    from.mockReturnValue(builder);
    rpc.mockReturnValue({
      abortSignal: () => Promise.resolve({ data: fila, error: null, status: 200 }),
    });
    const repo = TestBed.inject(AlumnosSupabaseRepository);
    const datos = {
      ...alumno,
      configuracionMensual: {
        ...alumno.configuracionMensual!,
        periodoInicio: fechaArgentina().slice(0, 7),
      },
    };
    await repo.guardar(datos, false);
    expect(rpc.mock.calls[0][1].p_datos.configuracion_mensual).not.toHaveProperty('periodo_inicio');
    await repo.guardar(
      {
        ...datos,
        configuracionMensual: { ...datos.configuracionMensual, periodoInicio: '2028-02' },
      },
      true,
      '2028-02',
    );
    expect(rpc.mock.calls[1][0]).toBe('crear_alumno_con_primera_cuota');
    expect(rpc.mock.calls[1][1].p_periodo).toBe('2028-02');
    expect(from).toHaveBeenCalledTimes(1);
    await expect(
      repo.guardar(
        {
          ...datos,
          configuracionMensual: { ...datos.configuracionMensual, periodoInicio: '2028-02' },
        },
        false,
      ),
    ).rejects.toMatchObject({ code: 'TCF_ESQUEMA_MENSUAL' });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('no ignora errores de red o RLS al comprobar el nuevo campo mensual', async () => {
    const builder: any = {};
    for (const method of ['select', 'limit']) builder[method] = vi.fn().mockReturnValue(builder);
    builder.abortSignal = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
      status: 403,
    });
    from.mockReturnValue(builder);
    await expect(
      TestBed.inject(AlumnosSupabaseRepository).guardar(
        {
          ...alumno,
          configuracionMensual: { ...alumno.configuracionMensual!, periodoInicio: '2028-02' },
        },
        false,
      ),
    ).rejects.toMatchObject({ code: '42501', status: 403 });
    expect(rpc).not.toHaveBeenCalled();
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
  it('envía alumno, configuración y período en una sola RPC atómica sin fallback', async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: fila, error: null }) });
    const repo = TestBed.inject(AlumnosSupabaseRepository);
    expect(await repo.guardar(alumno, true, '2028-02')).toEqual(alumno);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'crear_alumno_con_primera_cuota',
      expect.objectContaining({
        p_id: alumno.id,
        p_periodo: '2028-02',
        p_datos: expect.objectContaining({
          configuracion_mensual: { habilitada: true, importe: 10000, dia_vencimiento: 31 },
        }),
      }),
    );
    expect(from).not.toHaveBeenCalled();
    rpc.mockClear().mockReturnValue({
      abortSignal: () => Promise.resolve({ data: null, error: { code: 'PGRST202' } }),
    });
    await expect(repo.guardar(alumno, true, '2028-02')).rejects.toMatchObject({ code: 'PGRST202' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });
  it('rechaza primera cuota por edición, configuración deshabilitada o período inválido', async () => {
    const repo = TestBed.inject(AlumnosSupabaseRepository);
    await expect(repo.guardar(alumno, false, '2028-02')).rejects.toMatchObject({ code: '22023' });
    await expect(repo.guardar(alumno, true, '2028-13')).rejects.toMatchObject({ code: '22023' });
    await expect(
      repo.guardar({ ...alumno, configuracionMensual: undefined }, true, '2028-02'),
    ).rejects.toMatchObject({ code: '22023' });
    expect(rpc).not.toHaveBeenCalled();
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
  it('conserva el error técnico y el último listado confirmado sin duplicar el aviso con Toast', async () => {
    const mostrar = vi.fn();
    TestBed.overrideProvider(ToastService, { useValue: { mostrar } });
    repo.listar.mockResolvedValue([alumno]);
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    repo.listar.mockRejectedValue({
      code: '42703',
      message: 'column configuraciones_mensuales_1.periodo_inicio does not exist',
      status: 400,
      operacion: 'Listar alumnos',
      recurso: 'alumnos / configuraciones_mensuales',
    });
    await service.recargar();
    expect(service.errorListado()).toBeTruthy();
    expect(service.detalleErrorListado()).toMatchObject({
      codigo: '42703',
      estadoHttp: 400,
      operacion: 'Listar alumnos',
      mensaje: expect.stringContaining('privacidad'),
    });
    expect(service.alumnos()).toEqual([alumno]);
    expect(service.listadoCargado()).toBe(true);
    expect(service.cargando()).toBe(false);
    expect(mostrar).not.toHaveBeenCalled();
    repo.listar.mockResolvedValue([alumno]);
    await service.recargar();
    expect(service.errorListado()).toBe('');
    expect(service.detalleErrorListado()).toBeNull();
    expect(service.alumnos()).toEqual([alumno]);
  });
  it('mantiene separados el fallo del listado y la RPC de primera cuota ausente', async () => {
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    repo.guardar.mockRejectedValueOnce({
      code: 'PGRST202',
      status: 404,
      message: 'Could not find the function public.crear_alumno_con_primera_cuota',
      operacion: 'Guardar alumno',
      recurso: 'crear_alumno_con_primera_cuota',
    });
    expect(await service.guardar(alumno, undefined, alumno.id, '2028-02')).toBe(false);
    expect(service.error()).toContain('No se pudo crear el alumno');
    expect(service.errorListado()).toBe('');
    expect(service.alumnos()).toEqual([]);
    expect(service.mensaje()).toBe('');
    repo.listar.mockRejectedValueOnce({
      code: 'PGRST200',
      status: 400,
      message: 'Relationship not found',
      operacion: 'Listar alumnos',
    });
    await service.recargar();
    expect(service.error()).toContain('No se pudo crear el alumno');
    expect(service.errorListado()).toContain('No pudimos');
    expect(service.detalleError()?.estadoHttp).toBe(404);
    expect(service.detalleErrorListado()?.estadoHttp).toBe(400);
  });
  it('confirma primera cuota solo después de guardar y explica un duplicado sin publicar un alta', async () => {
    const service = TestBed.inject(AlumnosService);
    await service.recargar();
    let resolver!: (a: typeof alumno) => void;
    repo.guardar.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    const guardado = service.guardar(alumno, undefined, alumno.id, '2028-02');
    expect(service.mensaje()).toBe('');
    expect(service.alumnos()).toEqual([]);
    resolver(alumno);
    expect(await guardado).toBe(true);
    expect(service.mensaje()).toBe('Alumno y primera cuota creados');
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ id: alumno.id }),
      true,
      '2028-02',
    );
    repo.guardar.mockRejectedValueOnce({ code: '23505' });
    expect(await service.guardar(alumno, undefined, alumno.id, '2028-02')).toBe(false);
    expect(service.mensaje()).toBe('');
    expect(service.error()).toContain('ya existe');
    expect(service.alumnos()).toHaveLength(1);
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
  it('no reinicia datos ni filtros ante un evento repetido de la misma sesión', async () => {
    repo.listar.mockResolvedValue([alumno]);
    const service = TestBed.inject(AlumnosService);
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    service.filtros.busqueda.set('Ana');
    const calls = repo.listar.mock.calls.length;
    const auth = TestBed.inject(AuthService);
    (auth.session as ReturnType<typeof signal>).set({ ...auth.session()! });
    TestBed.tick();
    expect(repo.listar).toHaveBeenCalledTimes(calls);
    expect(service.alumnos()).toEqual([alumno]);
    expect(service.listadoCargado()).toBe(true);
    expect(service.filtros.busqueda()).toBe('Ana');
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
