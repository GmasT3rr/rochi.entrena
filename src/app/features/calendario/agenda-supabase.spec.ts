import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';
import { authRuntime } from '../../core/auth/auth-runtime';
import {
  AgendaApi,
  AgendaSupabase,
  errorAgenda,
  mapearTurno,
  rangoAgendaValido,
} from './agenda-supabase';
import { DatosTurno, fechaBuenosAires } from './agenda';

const datos: DatosTurno = {
  fecha: '2026-10-30',
  inicio: '23:30',
  duracion: 30,
  modalidad: 'Presencial',
  alumnoIds: ['a', 'b'],
  observaciones: '',
  titulo: 'Fuerza',
};
const fila = {
  id: 't',
  fecha: '2026-10-30',
  hora_inicio: '23:30:00',
  hora_fin: '24:00:00',
  titulo: 'Fuerza',
  modalidad: 'Presencial',
  alumno_ids: ['a', 'b'],
  observaciones: '',
  estado: 'programado',
  actualizado_en: '2026-10-30T10:00:00.123456+00:00',
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

describe('Agenda API con SDK simulado; no prueba RLS real', () => {
  const session = signal<any>({ access_token: 'token', user: { id: 'owner' } }),
    recovery = signal(false),
    verify = vi.fn();
  const query: any = {};
  const rpc = vi.fn();
  let api: AgendaApi;
  beforeEach(() => {
    session.set({ access_token: 'token', user: { id: 'owner' } });
    recovery.set(false);
    verify.mockReset().mockResolvedValue(true);
    rpc.mockReset();
    for (const method of ['select', 'gte', 'lte', 'eq', 'order', 'range'])
      query[method] = vi.fn(() => query);
    query.abortSignal = vi.fn().mockResolvedValue({ data: [fila], error: null, count: 1 });
    rpc.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ data: { cantidad: 1 }, error: null }),
    });
    authRuntime.client = { from: vi.fn(() => query), rpc } as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session, recovery, initializationError: signal('') } },
        { provide: AdminAuthorization, useValue: { verify } },
      ],
    });
    api = TestBed.inject(AgendaApi);
  });
  afterEach(() => {
    authRuntime.client = null;
  });
  it('consulta exclusivamente el rango solicitado, ordena y pagina sin truncar 500 resultados', async () => {
    query.abortSignal
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, i) => ({ ...fila, id: String(i) })),
        count: 501,
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ ...fila, id: '500' }], count: 501, error: null });
    expect(await api.listar('2026-10-01', '2026-11-01')).toHaveLength(501);
    expect(query.gte).toHaveBeenCalledWith('fecha', '2026-10-01');
    expect(query.lte).toHaveBeenCalledWith('fecha', '2026-11-01');
    expect(query.range).toHaveBeenLastCalledWith(500, 999);
    expect(query.eq).toHaveBeenCalledWith('estado', 'programado');
  });
  it('envía el contrato RPC, medianoche 24:00 y versión sin perder microsegundos', async () => {
    await api.guardar('solicitud', datos, [3, 1, 1], 't', fila.actualizado_en, true);
    expect(rpc).toHaveBeenCalledWith(
      'guardar_entrenamiento_agenda',
      expect.objectContaining({
        p_solicitud: 'solicitud',
        p_periodo: '2026-10',
        p_version: fila.actualizado_en,
        p_dias: [1, 3],
        p_datos: expect.objectContaining({ fin: '24:00', alumno_ids: ['a', 'b'] }),
      }),
    );
    await api.cancelar('otra', 't', fila.actualizado_en);
    expect(rpc).toHaveBeenCalledWith('cancelar_entrenamiento_agenda', {
      p_solicitud: 'otra',
      p_id: 't',
      p_version: fila.actualizado_en,
    });
  });
  it('falla cerrado sin permisos, en recuperación y si cambia la sesión durante la consulta', async () => {
    verify.mockResolvedValueOnce(false);
    await expect(api.listar('2026-10-01', '2026-10-31')).rejects.toMatchObject({ code: '42501' });
    expect(query.select).not.toHaveBeenCalled();
    recovery.set(true);
    await expect(api.cancelar('x', 't', fila.actualizado_en)).rejects.toMatchObject({
      code: '42501',
    });
    expect(rpc).not.toHaveBeenCalled();
    recovery.set(false);
    query.abortSignal.mockImplementationOnce(async () => {
      session.set({ access_token: 'otro' });
      return { data: [fila], count: 1, error: null };
    });
    await expect(api.listar('2026-10-01', '2026-10-31')).rejects.toMatchObject({ code: '42501' });
  });
  it('identifica esquema pendiente, rechaza respuesta inválida y no reemplaza fallos por memoria', async () => {
    query.abortSignal.mockResolvedValueOnce({ error: { code: '42P01' }, data: null });
    await expect(api.listar('2026-10-01', '2026-10-31')).rejects.toMatchObject({ code: '42P01' });
    expect(errorAgenda({ code: '42P01' }).message).toContain('016-agenda');
    query.abortSignal.mockResolvedValueOnce({
      data: [{ ...fila, hora_fin: '23:00:00' }],
      error: null,
      count: 1,
    });
    await expect(api.listar('2026-10-01', '2026-10-31')).rejects.toThrow();
    expect(() => mapearTurno({ ...fila, alumno_ids: [] })).toThrow();
    expect(() => mapearTurno({ ...fila, hora_inicio: '23:30:01' })).toThrow();
  });
  it('valida rangos acotados y fechas argentinas sin depender del huso del navegador', () => {
    expect(rangoAgendaValido('2026-10-01', '2026-11-01')).toBe(true);
    expect(rangoAgendaValido('2026-02-30', '2026-03-01')).toBe(false);
    expect(rangoAgendaValido('2026-01-01', '2026-12-31')).toBe(false);
    expect(fechaBuenosAires(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
    expect(fechaBuenosAires(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
  });
});

describe('Estado remoto de Agenda', () => {
  const session = signal<any>({ access_token: 'token' }),
    recovery = signal(false);
  const listar = vi.fn(),
    guardar = vi.fn(),
    cancelar = vi.fn();
  let service: AgendaSupabase;
  beforeEach(() => {
    session.set({ access_token: 'token' });
    recovery.set(false);
    listar.mockReset().mockResolvedValue([mapearTurno(fila)]);
    guardar.mockReset().mockResolvedValue(1);
    cancelar.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        AgendaSupabase,
        { provide: AgendaApi, useValue: { listar, guardar, cancelar } },
        { provide: AuthService, useValue: { session, recovery, initializationError: signal('') } },
      ],
    });
    service = TestBed.inject(AgendaSupabase);
    TestBed.tick();
  });
  it('carga, persiste y refresca solo el intervalo afectado después de confirmar', async () => {
    await service.cargar('2026-10-01', '2026-11-01');
    expect(service.listar()).toHaveLength(1);
    await service.guardar(datos, [], 't', false, fila.actualizado_en);
    expect(guardar).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      [],
      't',
      fila.actualizado_en,
      false,
    );
    expect(listar).toHaveBeenLastCalledWith('2026-10-01', '2026-11-01');
    await service.cancelar('t', fila.actualizado_en);
    expect(cancelar).toHaveBeenCalled();
    expect(service.guardando()).toBe(false);
  });
  it('descarta respuestas viejas al navegar y borra datos al cambiar de sesión', async () => {
    const viejo = deferred<any[]>();
    listar.mockReturnValueOnce(viejo.promise);
    const pending = service.cargar('2026-10-01', '2026-10-31');
    listar.mockResolvedValueOnce([]);
    await service.cargar('2026-11-01', '2026-11-30');
    viejo.resolve([mapearTurno(fila)]);
    await pending;
    expect(service.listar()).toEqual([]);
    await service.cargar('2026-10-01', '2026-10-31');
    session.set(null);
    TestBed.tick();
    expect(service.listar()).toEqual([]);
  });
  it('reutiliza solicitud tras respuesta perdida y bloquea doble envío mientras espera', async () => {
    guardar.mockRejectedValueOnce(new Error('respuesta perdida'));
    await expect(service.guardar(datos)).rejects.toThrow();
    const primero = guardar.mock.calls[0][0];
    const pendiente = deferred<number>();
    guardar.mockReturnValueOnce(pendiente.promise);
    const guardado = service.guardar(datos);
    await expect(service.guardar(datos)).rejects.toThrow('curso');
    expect(guardar.mock.calls[1][0]).toBe(primero);
    pendiente.resolve(1);
    await guardado;
    await service.guardar({ ...datos, titulo: 'Otro' });
    expect(guardar.mock.calls[2][0]).not.toBe(primero);
  });
  it('un refresco fallido después de COMMIT no anuncia guardado fallido ni vuelve a escribir', async () => {
    await service.cargar('2026-10-01', '2026-10-31');
    listar.mockRejectedValueOnce({ code: '42P01' });
    await expect(service.guardar(datos)).resolves.toBe(1);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(service.errorListado()).toContain('016-agenda');
    expect(service.listar()).toEqual([]);
  });
  it('rechaza edición o cancelación sin versión y no expone datos en recuperación', async () => {
    await expect(service.guardar(datos, [], 't')).rejects.toThrow('versión');
    await expect(service.cancelar('t')).rejects.toThrow('versión');
    expect(guardar).not.toHaveBeenCalled();
    await service.cargar('2026-10-01', '2026-10-31');
    recovery.set(true);
    TestBed.tick();
    expect(service.listar()).toEqual([]);
  });
});
