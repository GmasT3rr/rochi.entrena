import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CuentasService } from './cuentas-service';
import { fechaArgentina } from './cuentas-remotas-service';
import {
  CuentasSnapshot,
  CuentasSupabaseRepository,
  mapearCuentas,
} from './cuentas-supabase-repository';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { CuentasData, Cuota, DatosCuota, DatosPago, PagoCuota, validarCuentas } from '../cuentas';

const a = {
  id: 'remote-alumno',
  nombre: 'Ana',
  apellido: 'Pérez',
  modalidad: 'Online' as const,
  estado: 'Activo' as const,
};
const cuota: Cuota = {
  id: 'remote-cuota',
  alumnoId: a.id,
  concepto: 'Entrenamiento',
  periodo: '2026-10',
  importe: 100,
  vencimiento: '2026-10-31',
  observaciones: '',
};
const pago: PagoCuota = {
  id: 'remote-pago',
  cuotaId: cuota.id,
  importe: 30,
  fecha: '2026-10-10',
  medio: 'Efectivo',
  observaciones: '',
};
const stamp = '2026-10-01T12:00:00.000001+00:00';
function raw(cuotas: Cuota[] = [cuota], pagos: PagoCuota[] = []) {
  return {
    version: 1,
    alumnos: [a],
    cuotas: cuotas.map((c) => ({
      id: c.id,
      alumno_id: c.alumnoId,
      concepto: c.concepto,
      periodo: `${c.periodo}-01`,
      importe: c.importe,
      vencimiento: c.vencimiento,
      observaciones: c.observaciones,
      actualizado_en: stamp,
      revision: '9007199254740993',
    })),
    pagos: pagos.map((p) => ({
      id: p.id,
      cuota_id: p.cuotaId,
      importe: p.importe,
      fecha: p.fecha,
      medio: p.medio,
      observaciones: p.observaciones,
      actualizado_en: stamp,
    })),
  };
}
function auth() {
  return {
    session: signal<any>({ access_token: 'session-one' }),
    recovery: signal(false),
    initializationError: signal(''),
  };
}

describe('Repositorio financiero Supabase', () => {
  const verify = vi.fn();
  const rpc = vi.fn();
  const from = vi.fn();
  let session: ReturnType<typeof auth>;
  beforeEach(() => {
    verify.mockReset().mockResolvedValue(true);
    rpc.mockReset();
    from.mockReset();
    session = auth();
    authRuntime.client = { rpc, from } as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: session },
        { provide: AdminAuthorization, useValue: { verify } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    authRuntime.client = null;
  });
  it('lee un snapshot y conserva importes, relaciones, período y revisión sin pérdida de bigint', async () => {
    rpc.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ data: raw([cuota], [pago]), error: null }),
    });
    const snapshot = await TestBed.inject(CuentasSupabaseRepository).cargar();
    expect(snapshot.cuotas).toEqual([cuota]);
    expect(snapshot.pagos).toEqual([pago]);
    expect(snapshot.versionesCuotas[cuota.id].revision).toBe('9007199254740993');
    expect(rpc).toHaveBeenCalledWith('leer_cuentas_administrativas');
  });
  it('no acepta respuesta vacía/ambigua ni conjuntos sin integridad', () => {
    expect(() => mapearCuentas(null)).toThrow();
    expect(() => mapearCuentas({ ...raw(), alumnos: [] })).toThrow();
    expect(() => mapearCuentas(raw([cuota], [{ ...pago, importe: 101 }]))).toThrow();
    expect(mapearCuentas({ version: 1, alumnos: [], cuotas: [], pagos: [] }).cuotas).toEqual([]);
  });
  it('deniega lecturas y mutaciones sin sesión o administración, sin llamar tablas', async () => {
    session.session.set(null);
    await expect(TestBed.inject(CuentasSupabaseRepository).cargar()).rejects.toMatchObject({
      code: '42501',
    });
    session.session.set({ access_token: 'session-two' });
    verify.mockResolvedValue(false);
    await expect(
      TestBed.inject(CuentasSupabaseRepository).guardarCuota(cuota, true),
    ).rejects.toMatchObject({ code: '42501' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  function builder(result: any) {
    const query: any = {};
    for (const name of ['insert', 'update', 'delete', 'eq', 'select'])
      query[name] = vi.fn().mockReturnValue(query);
    query.abortSignal = vi.fn().mockResolvedValue(result);
    from.mockReturnValue(query);
    return query;
  }
  it('escribe columnas PostgreSQL y filtra ediciones por timestamp/revisión sin sobrescribirlos', async () => {
    const q = builder({ data: [{ id: cuota.id }], error: null });
    const repo = TestBed.inject(CuentasSupabaseRepository);
    await repo.guardarCuota(cuota, false, { actualizadoEn: stamp, revision: '42' });
    expect(q.update).toHaveBeenCalledWith({
      alumno_id: a.id,
      concepto: cuota.concepto,
      periodo: '2026-10-01',
      importe: 100,
      vencimiento: cuota.vencimiento,
      observaciones: '',
    });
    expect(q.eq.mock.calls).toEqual([
      ['id', cuota.id],
      ['actualizado_en', stamp],
      ['revision', '42'],
    ]);
  });
  it('mapea pagos y verifica una única fila devuelta al insertar/editar/eliminar', async () => {
    const q = builder({ data: [{ id: pago.id }], error: null });
    const repo = TestBed.inject(CuentasSupabaseRepository);
    await repo.guardarPago(pago, true);
    expect(q.insert).toHaveBeenCalledWith({
      id: pago.id,
      cuota_id: cuota.id,
      importe: 30,
      fecha: pago.fecha,
      medio: 'Efectivo',
      observaciones: '',
    });
    await repo.eliminarPago(pago.id, { actualizadoEn: stamp });
    expect(q.delete).toHaveBeenCalled();
    q.abortSignal.mockResolvedValue({ data: [], error: null });
    await expect(
      repo.eliminarCuota(cuota.id, { actualizadoEn: stamp, revision: '1' }),
    ).rejects.toMatchObject({ code: 'TCF_CONFLICTO' });
  });
  it('conserva errores del trigger y rechaza respuestas de otra sesión', async () => {
    const q = builder({ data: null, error: { code: 'P0001' } });
    await expect(
      TestBed.inject(CuentasSupabaseRepository).guardarPago(pago, true),
    ).rejects.toMatchObject({ code: 'P0001' });
    q.abortSignal.mockImplementation(async () => {
      session.session.set({ access_token: 'different' });
      return { data: [{ id: pago.id }], error: null };
    });
    await expect(
      TestBed.inject(CuentasSupabaseRepository).guardarPago(pago, true),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('Cuentas y pagos remotos con Signals', () => {
  let server: CuentasData;
  let repo: {
    cargar: ReturnType<typeof vi.fn>;
    guardarCuota: ReturnType<typeof vi.fn>;
    guardarPago: ReturnType<typeof vi.fn>;
    eliminarCuota: ReturnType<typeof vi.fn>;
    eliminarPago: ReturnType<typeof vi.fn>;
  };
  const snapshot = (): CuentasSnapshot => mapearCuentas(raw(server.cuotas, server.pagos));
  beforeEach(() => {
    server = { version: 1, cuotas: [], pagos: [] };
    repo = {
      cargar: vi.fn().mockImplementation(async () => snapshot()),
      guardarCuota: vi.fn().mockImplementation(async (c, crear) => {
        const data = {
          ...server,
          cuotas: crear ? [...server.cuotas, c] : server.cuotas.map((x) => (x.id === c.id ? c : x)),
        };
        validarCuentas(data);
        server = data;
      }),
      guardarPago: vi.fn().mockImplementation(async (p, crear) => {
        const data = {
          ...server,
          pagos: crear ? [...server.pagos, p] : server.pagos.map((x) => (x.id === p.id ? p : x)),
        };
        validarCuentas(data);
        server = data;
      }),
      eliminarCuota: vi.fn().mockImplementation(async (id) => {
        server = { ...server, cuotas: server.cuotas.filter((c) => c.id !== id) };
      }),
      eliminarPago: vi.fn().mockImplementation(async (id) => {
        server = { ...server, pagos: server.pagos.filter((p) => p.id !== id) };
      }),
    };
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth() },
        { provide: CuentasSupabaseRepository, useValue: repo },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });
  async function service() {
    const s = TestBed.inject(CuentasService);
    await s.recargar();
    s.hoy.set('2026-10-22');
    return s;
  }
  it('carga vacío sin mocks y no lee ni altera el archivo local', async () => {
    const keys = ['rochy.alumnos.v1', 'rochy.cuentas.v1', 'rochy.datos.v1'];
    for (const k of keys) localStorage.setItem(k, 'datos locales sin tocar');
    const s = await service();
    expect(s.cuentas()).toEqual([]);
    expect(await s.guardarCuota(cuota, undefined, cuota.id)).toBe(true);
    for (const k of keys) expect(localStorage.getItem(k)).toBe('datos locales sin tocar');
    expect(s.cuentas()[0].alumno).toBe('Ana Pérez');
  });
  it('crea, edita y vuelve a consultar después de recargar con el mismo ID', async () => {
    const s = await service();
    expect(await s.guardarCuota(cuota, undefined, cuota.id)).toBe(true);
    expect(await s.guardarCuota({ ...cuota, importe: 150 }, cuota.id)).toBe(true);
    await s.recargar();
    expect(s.cuotas()[0]).toMatchObject({ id: cuota.id, importe: 150 });
    expect(repo.guardarCuota.mock.calls[1][2]).toEqual({
      actualizadoEn: stamp,
      revision: '9007199254740993',
    });
  });
  it('admite varios pagos parciales, pago completo, edición y eliminación', async () => {
    server.cuotas = [cuota];
    const s = await service();
    expect(await s.guardarPago(pago, undefined, pago.id)).toBe(true);
    expect(s.cuentas()[0]).toMatchObject({ abonado: 30, saldo: 70, estado: 'Parcial' });
    expect(await s.guardarPago({ ...pago, importe: 20 }, pago.id)).toBe(true);
    expect(await s.guardarPago({ ...pago, importe: 80 }, undefined, 'pago-dos')).toBe(true);
    expect(s.cuentas()[0]).toMatchObject({ abonado: 100, saldo: 0, estado: 'Pagada' });
    expect(s.pagos()).toHaveLength(2);
    expect(await s.eliminarPago('pago-dos')).toBe(true);
    expect(s.cuentas()[0].saldo).toBe(80);
    expect(await s.eliminarCuota(cuota.id)).toBe(false);
    expect(repo.eliminarCuota).not.toHaveBeenCalled();
    expect(await s.eliminarPago(pago.id)).toBe(true);
    expect(await s.eliminarCuota(cuota.id)).toBe(true);
    expect(s.cuentas()).toEqual([]);
  });
  it('previene sobrepagos, fechas futuras, reducción bajo lo abonado y cuotas duplicadas', async () => {
    server = { version: 1, cuotas: [cuota], pagos: [pago] };
    const s = await service();
    expect(await s.guardarPago({ ...pago, importe: 71 })).toBe(false);
    expect(await s.guardarPago({ ...pago, importe: 1, fecha: '2026-10-23' })).toBe(false);
    expect(await s.guardarCuota({ ...cuota, importe: 29 }, cuota.id)).toBe(false);
    expect(await s.guardarCuota({ ...cuota, concepto: ' Entrenámiento ' })).toBe(false);
    expect(repo.guardarCuota).not.toHaveBeenCalled();
    expect(repo.guardarPago).not.toHaveBeenCalled();
  });
  it('calcula vencimientos y estados con fechas civiles argentinas', async () => {
    expect(fechaArgentina(new Date('2026-10-23T01:00:00Z'))).toBe('2026-10-22');
    server.cuotas = [{ ...cuota, vencimiento: '2026-10-21' }];
    const s = await service();
    expect(s.cuentas()[0].estado).toBe('Vencida');
    expect(s.proximaCuota(a.id)).toBe('2026-10-21');
    expect(s.saldoAlumno(a.id)).toBe(100);
    server.pagos = [pago];
    await s.recargar();
    expect(s.cuentas()[0].estado).toBe('Vencida');
  });
  it('espera la escritura y la lectura confirmadas; rechaza un doble envío', async () => {
    const s = await service();
    let resolve!: () => void;
    repo.guardarCuota.mockImplementation(
      () =>
        new Promise<void>(
          (r) =>
            (resolve = () => {
              server.cuotas = [cuota];
              r();
            }),
        ),
    );
    const pending = s.guardarCuota(cuota, undefined, cuota.id);
    expect(s.guardando()).toBe(true);
    expect(s.cuotas()).toEqual([]);
    expect(s.mensaje()).toBe('');
    expect(await s.guardarCuota({ ...cuota, concepto: 'Otra' })).toBe(false);
    resolve();
    expect(await pending).toBe(true);
    expect(s.cuotas()).toEqual([cuota]);
  });
  it.each(['P0001', '23505', '40001', 'TCF_CONFLICTO', '42501'])(
    'falla cerrado ante rechazo/concurrencia %s y permite actualizar',
    async (code) => {
      server.cuotas = [cuota];
      const s = await service();
      repo.guardarPago.mockRejectedValue({ code });
      expect(await s.guardarPago(pago)).toBe(false);
      expect(s.disponible()).toBe(false);
      expect(s.mensaje()).toBe('');
      expect(s.error()).toBeTruthy();
      await s.recargar();
      expect(s.disponible()).toBe(true);
      expect(s.cuentas()[0].saldo).toBe(100);
    },
  );
  it('distingue escritura confirmada de recarga fallida y bloquea la repetición', async () => {
    const s = await service();
    repo.cargar.mockRejectedValue(new Error('offline'));
    expect(await s.guardarCuota(cuota, undefined, cuota.id)).toBe(false);
    expect(server.cuotas).toHaveLength(1);
    expect(s.error()).toContain('fue confirmada');
    expect(s.disponible()).toBe(false);
    expect(await s.guardarCuota(cuota, undefined, cuota.id)).toBe(false);
    expect(repo.guardarCuota).toHaveBeenCalledTimes(1);
  });
  it('consulta cambios de otra sesión autorizada al actualizar sin crear registros', async () => {
    const s = await service();
    server.cuotas = [cuota];
    server.pagos = [pago];
    await s.recargar();
    expect(s.cuentas()[0].saldo).toBe(70);
    expect(repo.guardarCuota).not.toHaveBeenCalled();
  });
});
