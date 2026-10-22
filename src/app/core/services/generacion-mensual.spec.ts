import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { AdminAuthorization } from '../auth/admin-authorization';
import { authRuntime } from '../auth/auth-runtime';
import { leerResultadoMensual, leerVistaMensual, VistaMensualRemota } from '../mensual';
import { CuentasSupabaseRepository, mapearCuentas } from './cuentas-supabase-repository';
import { CuentasService } from './cuentas-service';

export const vistaMensualPrueba = (): VistaMensualRemota => ({
  periodo: '2028-02',
  huella: 'a'.repeat(32),
  cuotas: [
    {
      alumnoId: 'remoto',
      alumno: 'Ana Pérez',
      concepto: 'Cuota de entrenamiento',
      periodo: '2028-02',
      importe: 12345.67,
      vencimiento: '2028-02-29',
      observaciones: '',
    },
  ],
  omitidos: [
    { alumnoId: 'inactivo', alumno: 'Otra Persona', motivo: 'Alumno inactivo o en pausa' },
  ],
});
const resultado = () => ({
  periodo: '2028-02',
  estado: 'confirmada' as const,
  generadas: 1,
  omitidas: 1,
  fallidas: 0,
  detalleOmitidos: vistaMensualPrueba().omitidos,
});
const auth = () => ({
  session: signal<any>({ access_token: 'token-test' }),
  recovery: signal(false),
  initializationError: signal(''),
});

describe('RPC y contratos mensuales', () => {
  const verify = vi.fn();
  const rpc = vi.fn();
  beforeEach(() => {
    verify.mockReset().mockResolvedValue(true);
    rpc.mockReset();
    authRuntime.client = { rpc } as never;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth() },
        { provide: AdminAuthorization, useValue: { verify } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    authRuntime.client = null;
  });
  it('consulta la vista exclusivamente en servidor y confirma solo con período/huella', async () => {
    rpc.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ data: vistaMensualPrueba(), error: null }),
    });
    const repo = TestBed.inject(CuentasSupabaseRepository);
    expect(await repo.previsualizarMensual('2028-02')).toEqual(vistaMensualPrueba());
    expect(rpc).toHaveBeenCalledWith('previsualizar_cuotas_mensuales', { p_periodo: '2028-02' });
    rpc.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ data: resultado(), error: null }),
    });
    expect(await repo.generarMensual('2028-02', 'a'.repeat(32))).toEqual(resultado());
    expect(rpc).toHaveBeenLastCalledWith('generar_cuotas_mensuales', {
      p_periodo: '2028-02',
      p_huella: 'a'.repeat(32),
    });
  });
  it('rechaza período inválido y falta de autorización sin ejecutar la RPC', async () => {
    const repo = TestBed.inject(CuentasSupabaseRepository);
    await expect(repo.previsualizarMensual('2028-13')).rejects.toMatchObject({
      code: 'TCF_MENSUAL_PERIODO',
    });
    verify.mockResolvedValue(false);
    await expect(repo.generarMensual('2028-02', 'a'.repeat(32))).rejects.toMatchObject({
      code: '42501',
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['PGRST202', '', 'TCF_MENSUAL_RPC'],
    ['P0001', 'VISTA_MENSUAL_DESACTUALIZADA', 'TCF_MENSUAL_DESACTUALIZADA'],
    ['40001', '', '40001'],
  ])('propaga %s sin asumir éxito', async (code, message, expected) => {
    rpc.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ data: null, error: { code, message } }),
    });
    await expect(
      TestBed.inject(CuentasSupabaseRepository).generarMensual('2028-02', 'a'.repeat(32)),
    ).rejects.toMatchObject({ code: expected });
  });
  it('valida fechas, importes, duplicados y contadores devueltos por el servidor', () => {
    expect(leerVistaMensual(vistaMensualPrueba()).cuotas[0].vencimiento).toBe('2028-02-29');
    for (const vencimiento of ['2027-02-29', '2028-02-30', '2028-03-01']) {
      const v = vistaMensualPrueba();
      v.cuotas[0].vencimiento = vencimiento;
      expect(() => leerVistaMensual(v)).toThrow();
    }
    const duplicada = vistaMensualPrueba();
    duplicada.cuotas.push(duplicada.cuotas[0]);
    expect(() => leerVistaMensual(duplicada)).toThrow();
    expect(() => leerResultadoMensual({ ...resultado(), omitidas: 99 })).toThrow();
    expect(() => leerResultadoMensual({ ...resultado(), estado: 'revertida' })).toThrow();
    expect(() => leerResultadoMensual(null)).toThrow();
  });
});

describe('Generación mensual coordinada con las cuentas remotas', () => {
  const repo = { cargar: vi.fn(), previsualizarMensual: vi.fn(), generarMensual: vi.fn() };
  beforeEach(() => {
    repo.cargar
      .mockReset()
      .mockResolvedValue(mapearCuentas({ version: 1, alumnos: [], cuotas: [], pagos: [] }));
    repo.previsualizarMensual.mockReset().mockResolvedValue(vistaMensualPrueba());
    repo.generarMensual.mockReset().mockResolvedValue(resultado());
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth() },
        { provide: CuentasSupabaseRepository, useValue: repo },
      ],
    });
  });
  async function service() {
    const s = TestBed.inject(CuentasService);
    await s.recargar();
    return s;
  }
  it('no consulta localStorage, espera confirmación y refresca cuentas', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const s = await service();
      const vista = await s.previsualizarMensual('2028-02');
      let resolve!: (r: ReturnType<typeof resultado>) => void;
      repo.generarMensual.mockReturnValue(new Promise((r) => (resolve = r)));
      const pendiente = s.generarMensual(vista);
      expect(s.guardando()).toBe(true);
      expect(s.mensaje()).toBe('');
      expect(await s.generarMensual(vista)).toBeNull();
      resolve(resultado());
      expect(await pendiente).toEqual(resultado());
      expect(repo.cargar).toHaveBeenCalledTimes(2);
      expect(s.mensaje()).toContain('1 cuotas generadas');
      expect(get).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
  it('expone la reversión completa con cero generadas y candidatas fallidas', async () => {
    const s = await service();
    const revertida = { ...resultado(), estado: 'revertida', generadas: 0, fallidas: 1 };
    repo.generarMensual.mockResolvedValue(revertida);
    expect(await s.generarMensual(vistaMensualPrueba())).toEqual(revertida);
    expect(s.mensaje()).toContain('lote completo fue revertido');
  });
  it('conserva recuento confirmado si falla la recarga sin permitir otro envío', async () => {
    const s = await service();
    repo.cargar.mockRejectedValue(new Error('offline'));
    expect(await s.generarMensual(vistaMensualPrueba())).toEqual(resultado());
    expect(s.error()).toContain('fue confirmada');
    expect(s.disponible()).toBe(false);
    expect(await s.generarMensual(vistaMensualPrueba())).toBeNull();
    expect(repo.generarMensual).toHaveBeenCalledTimes(1);
  });
  it('no inventa contadores ante red fallida o vista desactualizada', async () => {
    const s = await service();
    repo.generarMensual.mockRejectedValue({ code: 'TCF_MENSUAL_DESACTUALIZADA' });
    expect(await s.generarMensual(vistaMensualPrueba())).toBeNull();
    expect(s.error()).toContain('vista previa cambió');
    expect(s.mensaje()).toBe('');
  });
});
