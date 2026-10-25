import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CuentasService } from './cuentas-service';
import { CuentasSupabaseRepository, mapearCuentas } from './cuentas-supabase-repository';
import { AuthService } from '../auth/auth-service';
import { ResumenDashboard } from './resumen-dashboard';
import { validarCobroDirecto, CobroDirecto } from '../cobros-directos';
const cobro: CobroDirecto = {
  id: 'd1',
  alumnoId: 'a',
  concepto: 'Evaluación',
  importe: 25.5,
  fecha: '2026-10-01',
  medio: 'Efectivo',
  observaciones: '',
};
const alumno = { id: 'a', nombre: 'Ana', apellido: 'Pérez', modalidad: 'Online', estado: 'Activo' };
describe('Cobros directos', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });
  it('rechaza importes cero, negativos, decimales excesivos y fechas inexistentes', () => {
    for (const importe of [0, -1, 1.001, NaN, Infinity])
      expect(() => validarCobroDirecto({ ...cobro, importe })).toThrow();
    expect(() => validarCobroDirecto({ ...cobro, fecha: '2026-02-30' })).toThrow();
    expect(() => validarCobroDirecto({ ...cobro, concepto: '  ' })).toThrow();
  });
  it('mapea cobros con versi?n y exige alumno visible', () => {
    const raw = {
      version: 1,
      alumnos: [alumno],
      cuotas: [],
      pagos: [],
      cobros_directos: [{ ...cobro, alumno_id: 'a', actualizado_en: '2026-10-01T12:00:00Z' }],
    };
    expect(mapearCuentas(raw).cobrosDirectos).toEqual([cobro]);
    expect(() => mapearCuentas({ ...raw, alumnos: [] })).toThrow();
  });
  function preparar(conPago = false) {
    let data: any = {
      version: 1,
      alumnos: [alumno],
      cuotas: conPago
        ? [
            {
              id: 'q',
              alumnoId: 'a',
              concepto: 'Cuota',
              periodo: '2026-10',
              importe: 100,
              vencimiento: '2026-10-31',
              observaciones: '',
            },
          ]
        : [],
      pagos: conPago
        ? [
            {
              id: 'p',
              cuotaId: 'q',
              importe: 30,
              fecha: '2026-10-02',
              medio: 'Efectivo',
              observaciones: '',
            },
          ]
        : [],
      cobrosDirectos: [],
      versionesCobros: {},
      versionesCuotas: {},
      versionesPagos: {},
    };
    const repository = {
      cargar: vi.fn(async () => structuredClone(data)),
      guardarCobro: vi.fn(async (c: CobroDirecto, crear: boolean) => {
        data.cobrosDirectos = crear
          ? [...data.cobrosDirectos, c]
          : data.cobrosDirectos.map((x: CobroDirecto) => (x.id === c.id ? c : x));
        data.versionesCobros[c.id] = { actualizadoEn: '2026-10-01T12:00:00Z' };
      }),
      eliminarCobro: vi.fn(async (id: string) => {
        data.cobrosDirectos = data.cobrosDirectos.filter((c: CobroDirecto) => c.id !== id);
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: CuentasSupabaseRepository, useValue: repository },
        { provide: AuthService, useValue: { session: signal(null) } },
      ],
    });
    const service = TestBed.inject(CuentasService);
    return { service, repository };
  }
  it('consolida pagos y cobros una vez y mantiene el saldo de la cuota', async () => {
    const { service } = preparar(true);
    await service.recargar();
    await service.guardarCobro(cobro, true);
    const resumen = TestBed.inject(ResumenDashboard);
    resumen.elegirPeriodo('2026-10');
    expect(resumen.ingresos()).toBe(55.5);
    expect(service.ingresos()).toHaveLength(2);
    expect(service.saldoAlumno('a')).toBe(70);
    expect(resumen.emitido()).toBe(100);
    expect(resumen.abonadoPeriodo()).toBe(30);
    expect(resumen.evolucion().at(-1)?.valor).toBe(55.5);
    resumen.elegirPeriodo('2026-09');
    expect(resumen.ingresos()).toBe(0);
  });
  it('persiste alta, permite conceptos repetidos, edita y elimina sin crear cuotas, pagos ni deuda', async () => {
    const { service, repository } = preparar();
    await service.recargar();
    expect(await service.guardarCobro(cobro, true)).toBe(true);
    expect(await service.guardarCobro({ ...cobro, id: 'd2' }, true)).toBe(true);
    expect(service.ingresos().reduce((n, c) => n + c.importe, 0)).toBe(51);
    expect(service.cuotas()).toEqual([]);
    expect(service.pagos()).toEqual([]);
    expect(service.saldoAlumno('a')).toBe(0);
    const resumen = TestBed.inject(ResumenDashboard);
    resumen.elegirPeriodo('2026-10');
    expect(resumen.ingresos()).toBe(51);
    expect(resumen.pendiente()).toBe(0);
    expect(resumen.vencidas()).toBe(0);
    expect(
      await service.guardarCobro({ ...cobro, importe: 30 }, false, service.versionCobro('d1')),
    ).toBe(true);
    expect(resumen.ingresos()).toBe(55.5);
    await service.eliminarCobro('d1', service.versionCobro('d1'));
    expect(resumen.ingresos()).toBe(25.5);
    expect(repository.eliminarCobro).toHaveBeenCalledOnce();
  });
  it('bloquea env?os concurrentes y fechas futuras', async () => {
    const { service, repository } = preparar();
    await service.recargar();
    expect(await service.guardarCobro({ ...cobro, fecha: '9999-12-31' }, true)).toBe(false);
    const primero = service.guardarCobro(cobro, true);
    const segundo = service.guardarCobro(cobro, true);
    expect(await segundo).toBe(false);
    expect(await primero).toBe(true);
    expect(repository.guardarCobro).toHaveBeenCalledOnce();
  });
});
