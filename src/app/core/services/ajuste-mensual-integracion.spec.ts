import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AlumnosService } from './alumnos-service';
import { CuentasService } from './cuentas-service';
import { AlumnosSupabaseRepository, mapearAlumno } from './alumnos-supabase-repository';
import { CuentasSupabaseRepository, mapearCuentas } from './cuentas-supabase-repository';
import { AuthService } from '../auth/auth-service';
import { ToastService } from './toast-service';

describe('Confirmación conjunta de configuración y cuota', () => {
  const version = '2026-10-01T10:00:00.123456Z';
  const fila = {
    id: 'a',
    nombre: 'Ana',
    apellido: 'Local',
    telefono: '',
    email: '',
    observaciones: '',
    modalidad: 'Online',
    estado: 'Activo',
    fecha_ingreso: '2026-01-01',
    configuracion_mensual: {
      habilitada: true,
      importe: 100000,
      dia_vencimiento: 10,
      actualizado_en: version,
    },
  };
  const raw = {
    version: 1,
    alumnos: [fila],
    cuotas: [
      {
        id: 'c',
        alumno_id: 'a',
        concepto: 'Cuota de entrenamiento',
        periodo: '2026-10-01',
        importe: 100000,
        vencimiento: '2026-10-10',
        observaciones: '',
        actualizado_en: version,
        revision: '1',
      },
    ],
    pagos: [
      {
        id: 'p',
        cuota_id: 'c',
        importe: 40000,
        fecha: '2026-10-01',
        medio: 'Otro',
        observaciones: '',
        actualizado_en: version,
      },
    ],
    cobros_directos: [],
  };
  async function preparar(configInicial = 100000, importeNuevo = 40000, abonado = 40000) {
    const origen = { ...raw, pagos: raw.pagos.map((p) => ({ ...p, importe: abonado })) };
    let persistido = mapearCuentas(origen),
      alumno = mapearAlumno({
        ...fila,
        configuracion_mensual: { ...fila.configuracion_mensual, importe: configInicial },
      });
    const ajustarMensual = vi.fn(async () => {
      persistido = mapearCuentas({
        ...origen,
        cuotas: raw.cuotas.map((c) => ({
          ...c,
          importe: importeNuevo,
          actualizado_en: '2026-10-02T10:00:00Z',
        })),
      });
      alumno = mapearAlumno({
        ...fila,
        configuracion_mensual: {
          ...fila.configuracion_mensual,
          importe: importeNuevo,
          actualizado_en: '2026-10-02T10:00:00Z',
        },
      });
      return { alumno, cuentas: persistido };
    });
    const mostrar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session: signal({ access_token: 'prueba' }) } },
        {
          provide: AlumnosSupabaseRepository,
          useValue: { listar: async () => [alumno], ajustarMensual },
        },
        { provide: CuentasSupabaseRepository, useValue: { cargar: async () => persistido } },
        { provide: ToastService, useValue: { mostrar } },
      ],
    });
    const alumnos = TestBed.inject(AlumnosService),
      cuentas = TestBed.inject(CuentasService);
    TestBed.tick();
    await alumnos.recargar();
    await cuentas.recargar();
    return { alumnos, cuentas, ajustarMensual, mostrar };
  }
  it('configuración ya en 120000: actualiza cuota 100000 con pago 80000 y relee saldo 40000', async () => {
    const { alumnos, cuentas, ajustarMensual } = await preparar(120000, 120000, 80000);
    expect(alumnos.alumnos()[0].configuracionMensual?.importe).toBe(120000);
    expect(cuentas.saldoAlumno('a')).toBe(20000);
    const pagos = structuredClone(cuentas.pagos());
    expect(
      await alumnos.guardarMensualConCuota(
        'a',
        { habilitada: true, importe: 120000, diaVencimiento: 10 },
        {
          periodo: '2026-10',
          cuotaId: 'c',
          versionConfiguracion: version,
          versionCuota: cuentas.versionCuota('c'),
        },
      ),
    ).toBe(true);
    expect(ajustarMensual).toHaveBeenCalledOnce();
    expect(cuentas.cuentas()[0].importe).toBe(120000);
    expect(cuentas.saldoAlumno('a')).toBe(40000);
    await alumnos.recargar();
    await cuentas.recargar();
    expect(alumnos.alumnos()[0].configuracionMensual?.importe).toBe(120000);
    expect(cuentas.cuentas()[0].importe).toBe(120000);
    expect(cuentas.pagos()).toEqual(pagos);
    expect(cuentas.saldoAlumno('a')).toBe(40000);
  });
  it('actualiza ambas fuentes compartidas y sus saldos sin una segunda escritura ni una recarga manual', async () => {
    const { alumnos, cuentas, ajustarMensual } = await preparar();
    expect(cuentas.saldoAlumno('a')).toBe(60000);
    expect(
      await alumnos.guardarMensualConCuota(
        'a',
        { habilitada: true, importe: 40000, diaVencimiento: 10 },
        {
          periodo: '2026-10',
          cuotaId: 'c',
          versionConfiguracion: version,
          versionCuota: cuentas.versionCuota('c'),
        },
      ),
    ).toBe(true);
    expect(ajustarMensual).toHaveBeenCalledOnce();
    expect(alumnos.alumnos()[0].configuracionMensual?.importe).toBe(40000);
    expect(cuentas.saldoAlumno('a')).toBe(0);
    expect(cuentas.cuentas()[0].estado).toBe('Pagada');
    expect(cuentas.pagos()).toEqual(mapearCuentas(raw).pagos);
    expect(cuentas.cuentas()[0].vencimiento).toBe('2026-10-10');
    await alumnos.recargar();
    await cuentas.recargar();
    expect(cuentas.saldoAlumno('a')).toBe(0);
    expect(alumnos.alumnos()[0].configuracionMensual?.importe).toBe(40000);
  });
  it('un fallo no actualiza ninguna fuente ni muestra éxito completo', async () => {
    const { alumnos, cuentas, ajustarMensual, mostrar } = await preparar();
    ajustarMensual.mockRejectedValue({
      code: '40001',
      recurso: 'ajustar_configuracion_y_cuota_actual',
    });
    expect(
      await alumnos.guardarMensualConCuota(
        'a',
        { habilitada: true, importe: 50000, diaVencimiento: 10 },
        {
          periodo: '2026-10',
          cuotaId: 'c',
          versionConfiguracion: version,
          versionCuota: cuentas.versionCuota('c'),
        },
      ),
    ).toBe(false);
    expect(alumnos.error()).toContain('No se guardaron cambios');
    expect(alumnos.alumnos()[0].configuracionMensual?.importe).toBe(100000);
    expect(cuentas.saldoAlumno('a')).toBe(60000);
    expect(mostrar).not.toHaveBeenCalledWith(expect.anything(), 'exito');
  });
});
