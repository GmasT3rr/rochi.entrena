import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AlumnoForm } from './alumno-form';
import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { CambiosPendientes } from '../../core/services/cambios-pendientes';
import { ToastService } from '../../core/services/toast-service';
import { fechaArgentina } from '../../core/services/cuentas-remotas-service';
import { CuentaVista } from '../../core/cuentas';

describe('Aplicación del importe mensual a la cuota actual', () => {
  const periodo = fechaArgentina().slice(0, 7);
  const config = {
    habilitada: true,
    importe: 100000,
    diaVencimiento: 10,
    periodoInicio: '2025-01',
    actualizadoEn: '2026-10-01T10:00:00.123456+00:00',
  };
  const alumno = {
    id: 'a',
    nombre: 'Ana',
    apellido: 'Local',
    telefono: '',
    email: '',
    observaciones: '',
    modalidad: 'Online',
    estado: 'Activo',
    fechaIngreso: '2025-01-01',
    configuracionMensual: config,
  };
  const cuota: CuentaVista = {
    id: 'c',
    alumnoId: 'a',
    alumno: 'Ana Local',
    modalidad: 'Online',
    concepto: 'Cuota de entrenamiento',
    periodo,
    importe: 100000,
    vencimiento: periodo + '-10',
    observaciones: '',
    abonado: 0,
    saldo: 100000,
    estado: 'Pendiente',
    pagos: [],
  };
  async function preparar(filas: CuentaVista[] = [cuota], importeConfigurado = 100000) {
    const alumnoActual = {
      ...alumno,
      configuracionMensual: { ...config, importe: importeConfigurado },
    };
    const guardar = vi.fn().mockResolvedValue(true),
      conjunto = vi.fn().mockResolvedValue(true),
      close = vi.fn();
    const finanzas = {
      recargar: vi.fn().mockResolvedValue(undefined),
      disponible: signal(true),
      errorCarga: signal(''),
      cuotasAlumno: vi.fn(() => filas),
      versionCuota: vi.fn(() => ({
        actualizadoEn: '2026-10-01T10:00:00.654321Z',
        revision: '9007199254740993',
      })),
    };
    const alumnos = {
      alumnos: signal([alumnoActual]),
      guardar,
      guardarMensualConCuota: conjunto,
      guardando: signal(false),
      cargando: signal(false),
      error: signal(''),
      detalleError: signal(null),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { alumno: alumnoActual, seccion: 'mensual' } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: AlumnosService, useValue: alumnos },
        { provide: CuentasService, useValue: finanzas },
        { provide: CambiosPendientes, useValue: { proteger: vi.fn() } },
        { provide: ToastService, useValue: { mostrar: vi.fn() } },
      ],
    });
    const f = TestBed.createComponent(AlumnoForm);
    await f.whenStable();
    return { f, c: f.componentInstance, guardar, conjunto, close, finanzas, alumnos };
  }
  it('oculta la opción si ambos importes coinciden y consulta sin escribir al abrir', async () => {
    const { f, c, guardar, conjunto, finanzas } = await preparar();
    expect(c.mostrarAplicacion()).toBe(false);
    c.form.controls.importeMensual.setValue(200000);
    await f.whenStable();
    expect(c.mostrarAplicacion()).toBe(true);
    expect(c.aplicarActual()).toBe(false);
    await c.guardar();
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        configuracionMensual: expect.objectContaining({ importe: 200000 }),
      }),
      'a',
    );
    expect(conjunto).not.toHaveBeenCalled();
    expect(finanzas.recargar).toHaveBeenCalledOnce();
  });
  it('permite ajustar solo la cuota cuando la configuración ya es 120000 y la cuota 100000 con 80000 abonados', async () => {
    const parcial = {
      ...cuota,
      estado: 'Parcial' as const,
      abonado: 80000,
      saldo: 20000,
      pagos: [
        {
          id: 'p',
          cuotaId: 'c',
          importe: 80000,
          fecha: periodo + '-01',
          medio: 'Otro' as const,
          observaciones: 'Pago existente',
        },
      ],
    };
    const { c, conjunto, guardar, finanzas } = await preparar([parcial], 120000);
    expect(c.cambioImporteConfiguracion()).toBe(false);
    expect(c.cuotaActualDifiere()).toBe(true);
    expect(c.mostrarAplicacion()).toBe(true);
    expect(c.aplicarActual()).toBe(false);
    expect(conjunto).not.toHaveBeenCalled();
    await c.seleccionarAplicacion(true);
    await c.guardar();
    expect(conjunto).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ importe: 120000 }),
      expect.objectContaining({ cuotaId: 'c', versionConfiguracion: config.actualizadoEn }),
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(finanzas.recargar).toHaveBeenCalledOnce();
  });
  it('configuración 120000 y cuota 120000 no ofrece ajuste de importe', async () => {
    const { c } = await preparar([{ ...cuota, importe: 120000, saldo: 120000 }], 120000);
    expect(c.cambioImporteConfiguracion()).toBe(false);
    expect(c.cuotaActualDifiere()).toBe(false);
    expect(c.mostrarAplicacion()).toBe(false);
  });
  it('permite bajar solo la configuración de 120000 a 100000 si la cuota ya es 100000', async () => {
    const { c, f, guardar, conjunto } = await preparar([cuota], 120000);
    await c.seleccionarAplicacion(true);
    c.form.controls.importeMensual.setValue(100000);
    await f.whenStable();
    expect(c.cambioImporteConfiguracion()).toBe(true);
    expect(c.cuotaActualDifiere()).toBe(false);
    expect(c.aplicarActual()).toBe(false);
    await c.guardar();
    expect(guardar).toHaveBeenCalled();
    expect(conjunto).not.toHaveBeenCalled();
  });
  it('identifica por mes actual y concepto, conserva primer período y envía versiones exactas', async () => {
    const { f, c, guardar, conjunto, close } = await preparar([
      cuota,
      { ...cuota, id: 'manual', concepto: 'Clase individual' },
      { ...cuota, id: 'historica', periodo: '2024-01' },
    ]);
    c.form.controls.importeMensual.setValue(200000);
    await c.seleccionarAplicacion(true);
    await f.whenStable();
    expect(c.cuotaActual()?.id).toBe('c');
    expect(c.form.controls.primerPeriodo.value).toBe('2025-01');
    expect(f.nativeElement.textContent).toContain('Importe anterior');
    expect(f.nativeElement.textContent).toContain('Importe nuevo');
    await c.guardar();
    expect(guardar).not.toHaveBeenCalled();
    expect(conjunto).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ importe: 200000, periodoInicio: '2025-01' }),
      {
        periodo,
        cuotaId: 'c',
        versionCuota: {
          actualizadoEn: '2026-10-01T10:00:00.654321Z',
          revision: '9007199254740993',
        },
        versionConfiguracion: config.actualizadoEn,
      },
    );
    expect(close).toHaveBeenCalledWith(true);
  });
  it('sin cuota informa que no la crea y pide un guardado transaccional sin id de cuota', async () => {
    const { f, c, conjunto } = await preparar([{ ...cuota, concepto: 'Clase manual' }]);
    c.form.controls.importeMensual.setValue(200000);
    await c.seleccionarAplicacion(true);
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('No se creará ninguna');
    await c.guardar();
    expect(conjunto).toHaveBeenCalledWith(
      'a',
      expect.anything(),
      expect.objectContaining({ cuotaId: null, versionCuota: undefined }),
    );
  });
  for (const tipo of ['pagada', 'ambigua', 'inferior a abonado'])
    it(`bloquea cuota ${tipo} sin guardar ninguna parte`, async () => {
      const parcial = {
        ...cuota,
        estado: 'Parcial' as const,
        abonado: 40000,
        saldo: 60000,
        pagos: [
          {
            id: 'p',
            cuotaId: 'c',
            importe: 40000,
            fecha: periodo + '-01',
            medio: 'Otro' as const,
            observaciones: '',
          },
        ],
      };
      const filas =
        tipo === 'pagada'
          ? [{ ...cuota, estado: 'Pagada' as const, saldo: 0, abonado: 100000 }]
          : tipo === 'ambigua'
            ? [cuota, { ...cuota, id: 'duplicada' }]
            : [parcial];
      const { c, guardar, conjunto } = await preparar(filas);
      c.form.controls.importeMensual.setValue(tipo === 'inferior a abonado' ? 30000 : 200000);
      await c.seleccionarAplicacion(true);
      expect(c.bloqueoCuotaActual()).not.toBe('');
      await c.guardar();
      expect(guardar).not.toHaveBeenCalled();
      expect(conjunto).not.toHaveBeenCalled();
    });
  it('permite igualar el total abonado y conserva el modal y los datos ante fallo', async () => {
    const parcial = {
      ...cuota,
      estado: 'Parcial' as const,
      abonado: 40000,
      saldo: 60000,
      pagos: [
        {
          id: 'p',
          cuotaId: 'c',
          importe: 40000,
          fecha: periodo + '-01',
          medio: 'Otro' as const,
          observaciones: '',
        },
      ],
    };
    const { c, conjunto, close, alumnos } = await preparar([parcial]);
    c.form.controls.importeMensual.setValue(40000);
    await c.seleccionarAplicacion(true);
    expect(c.bloqueoCuotaActual()).toBe('');
    conjunto.mockResolvedValue(false);
    alumnos.error.set('Conflicto: no se guardaron cambios');
    await c.guardar();
    expect(c.errorGuardado()).toContain('Conflicto');
    expect(c.form.controls.importeMensual.value).toBe(40000);
    expect(close).not.toHaveBeenCalled();
  });
  it('un fallo financiero no se interpreta como ausencia de cuota', async () => {
    const { c, finanzas, conjunto } = await preparar();
    c.form.controls.importeMensual.setValue(200000);
    finanzas.errorCarga.set('Sin conexión');
    await c.consultarCuotaActual();
    await c.seleccionarAplicacion(true);
    await c.guardar();
    expect(c.errorCuotaActual()).not.toBe('');
    expect(conjunto).not.toHaveBeenCalled();
  });
});
