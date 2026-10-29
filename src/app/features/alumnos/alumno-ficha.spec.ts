import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { AlumnoFicha } from './alumno-ficha';
import { AlumnoForm } from './alumno-form';
import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { AuthService } from '../../core/auth/auth-service';
import { DocumentosAlumnosRepository } from '../../core/services/documentos-alumnos-repository';
import { PerfilesEntrenamientoRepository } from '../../core/services/perfiles-entrenamiento-repository';
import { ConfirmarAlumno } from './confirmar-alumno';
import { CuentaForm } from '../cuentas/cuenta-form';
import { fechaArgentina } from '../../core/services/cuentas-remotas-service';

describe('Ficha integral del alumno', () => {
  const ana = {
    id: 'a',
    nombre: 'Ana',
    apellido: 'Perez',
    telefono: '123',
    email: 'ana@example.com',
    modalidad: 'Online',
    estado: 'Activo',
    fechaIngreso: '2026-10-01',
    observaciones: 'Observaciones existentes',
    configuracionMensual: { habilitada: true, importe: 15000, diaVencimiento: 10 },
  };
  let alumnos: any;
  let cuentas: any;
  const open = vi.fn(() => ({ afterClosed: () => of(true) }));
  beforeEach(() => {
    open.mockClear();
    alumnos = {
      alumnos: signal([ana]),
      cargandoInicial: signal(false),
      errorListado: signal(''),
      cargando: signal(false),
      guardando: signal(false),
      error: signal(''),
      detalleError: signal(null),
      recargar: vi.fn(),
    };
    cuentas = {
      hoy: signal(fechaArgentina()),
      alumnos: signal([ana]),
      cobrosDirectos: signal([
        {
          id: 'd',
          alumnoId: 'a',
          concepto: 'Clase',
          fecha: '2026-10-02',
          importe: 2000,
          medio: 'Otro',
        },
      ]),
      disponible: signal(true),
      cuotasAlumno: vi.fn(() => [
        {
          id: 'cuota',
          concepto: 'Mensualidad',
          periodo: '2026-10',
          estado: 'Parcial',
          saldo: 5000,
          alumnoId: 'a',
          vencimiento: '2026-10-10',
          importe: 15000,
        },
      ]),
      proximaCuota: vi.fn(() => '2026-10-10'),
      refrescarSiNecesario: vi.fn(),
      recargar: vi.fn(),
      cargandoInicial: signal(false),
      cargando: signal(false),
      guardando: signal(false),
      errorCarga: signal(''),
      tieneDatos: signal(true),
      saldoAlumno: vi.fn(() => 5000),
      ingresos: signal([
        {
          id: 'p',
          alumnoId: 'a',
          tipo: 'Pago de cuota',
          concepto: 'Mensualidad',
          fecha: '2026-10-01',
          importe: 10000,
          medio: 'Efectivo',
        },
        {
          id: 'd',
          alumnoId: 'a',
          tipo: 'Cobro directo',
          concepto: 'Clase',
          fecha: '2026-10-02',
          importe: 2000,
          medio: 'Otro',
        },
        { id: 'otro', alumnoId: 'b', tipo: 'Cobro directo', fecha: '2026-10-03' },
      ]),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: 'a' },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MatDialog, useValue: { open } },
        { provide: AlumnosService, useValue: alumnos },
        { provide: CuentasService, useValue: cuentas },
        { provide: AuthService, useValue: { session: signal({ access_token: 'test' }) } },
        {
          provide: PerfilesEntrenamientoRepository,
          useValue: { obtener: vi.fn(async () => null) },
        },
        {
          provide: DocumentosAlumnosRepository,
          useValue: {
            listar: vi.fn(async () => ({
              config: {
                max_bytes: 10485760,
                max_archivos: 10,
                formatos: { pdf: 'application/pdf' },
              },
              documentos: [],
            })),
          },
        },
      ],
    });
  });
  const mensual = (cambios: any = {}) => ({
    id: 'mensual',
    alumnoId: 'a',
    alumno: 'Ana Perez',
    modalidad: 'Online',
    concepto: 'Cuota de entrenamiento',
    periodo: fechaArgentina().slice(0, 7),
    importe: 110000,
    abonado: 80000,
    saldo: 30000,
    estado: 'Parcial',
    vencimiento: fechaArgentina().slice(0, 7) + '-10',
    observaciones: '',
    pagos: [],
    ...cambios,
  });
  it.each([110000, 120000])(
    'separa configuración de 120000 y cuota emitida de %s',
    async (importe) => {
      alumnos.alumnos.set([
        {
          ...ana,
          configuracionMensual: {
            habilitada: true,
            importe: 120000,
            diaVencimiento: 20,
            periodoInicio: '2025-01',
          },
        },
      ]);
      const cuota = mensual({ importe, saldo: importe - 80000 });
      cuentas.cuotasAlumno.mockReturnValue([cuota]);
      const f = TestBed.createComponent(AlumnoFicha);
      await f.whenStable();
      const nuevas = f.nativeElement.querySelector('[aria-labelledby="nuevas-cuotas-titulo"]');
      const emitida = f.nativeElement.querySelector('[aria-labelledby="cuota-actual-titulo"]');
      expect(nuevas.textContent).toContain('Configuración para nuevas cuotas');
      expect(nuevas.textContent).toMatch(/120[.,]000/);
      expect(nuevas.textContent).toContain('2025-01');
      expect(emitida.textContent).toContain('Importe emitido');
      expect(emitida.textContent).toContain('Total abonado');
      expect(emitida.textContent).toContain('Saldo pendiente');
      expect(emitida.textContent).toContain('Parcial');
      expect(emitida.textContent).toContain(cuota.periodo);
      expect(emitida.querySelector('.monthly-amount').textContent).toMatch(
        importe === 110000 ? /110[.,]000/ : /120[.,]000/,
      );
      expect(open).not.toHaveBeenCalled();
      expect(cuentas.recargar).not.toHaveBeenCalled();
    },
  );
  it('abre el editor unificado de cuota, conserva la ficha y refleja cambios de pagos sin cambiar configuración', async () => {
    TestBed.overrideComponent(AlumnoFicha, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const cuotas = signal([mensual()]);
    cuentas.cuotasAlumno.mockImplementation(() => cuotas());
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    const bloque = () => f.nativeElement.querySelector('[aria-labelledby="cuota-actual-titulo"]');
    bloque().querySelector('button').click();
    expect(open).toHaveBeenCalledWith(
      CuentaForm,
      expect.objectContaining({ data: { tipo: 'cuota', cuota: cuotas()[0] } }),
    );
    cuotas.set([mensual({ importe: 130000, abonado: 100000, saldo: 30000, estado: 'Parcial' })]);
    await f.whenStable();
    expect(bloque().querySelector('.monthly-amount').textContent).toMatch(/130[.,]000/);
    expect(bloque().textContent).toMatch(/100[.,]000/);
    expect(f.componentInstance.alumno()?.configuracionMensual?.importe).toBe(15000);
    cuotas.set([mensual({ importe: 130000, abonado: 130000, saldo: 0, estado: 'Pagada' })]);
    await f.whenStable();
    expect(bloque().querySelector('.badge--pagado').textContent).toContain('Pagada');
    expect(bloque().querySelector('button').textContent).toContain('Editar cuota actual');
    expect(cuentas.recargar).not.toHaveBeenCalled();
  });
  it.each([false, undefined])(
    'muestra cuota emitida con configuración deshabilitada o ausente (%s)',
    async (habilitada) => {
      alumnos.alumnos.set([
        {
          ...ana,
          configuracionMensual:
            habilitada === undefined ? undefined : { ...ana.configuracionMensual, habilitada },
        },
      ]);
      cuentas.cuotasAlumno.mockReturnValue([mensual()]);
      const f = TestBed.createComponent(AlumnoFicha);
      await f.whenStable();
      expect(
        f.nativeElement.querySelector('[aria-labelledby="cuota-actual-titulo"]').textContent,
      ).toMatch(/110[.,]000/);
      expect(
        f.nativeElement.querySelector('[aria-labelledby="nuevas-cuotas-titulo"]').textContent,
      ).toContain(habilitada === undefined ? 'No configurada' : 'Deshabilitada');
    },
  );
  it('no elige cuotas históricas, manuales de otro concepto ni de otro alumno; detecta ambigüedad', async () => {
    const cuotas = signal([
      mensual({ periodo: '2020-01' }),
      mensual({ concepto: 'Clase individual' }),
      mensual({ alumnoId: 'otro' }),
    ]);
    cuentas.cuotasAlumno.mockImplementation(() => cuotas());
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    const bloque = () => f.nativeElement.querySelector('[aria-labelledby="cuota-actual-titulo"]');
    expect(bloque().textContent).toContain('Todavía no hay cuota emitida este mes');
    cuotas.set([mensual(), mensual({ id: 'duplicada' })]);
    await f.whenStable();
    expect(bloque().textContent).toContain('No se seleccionó ninguna');
    expect(bloque().textContent).toContain('Consultar cuotas');
    f.componentInstance.editarCuotaActual();
    expect(open).not.toHaveBeenCalled();
  });
  it('una carga o error no se presenta como ausencia de cuota emitida', async () => {
    const f = TestBed.createComponent(AlumnoFicha);
    cuentas.cargandoInicial.set(true);
    await f.whenStable();
    const bloque = () => f.nativeElement.querySelector('[aria-labelledby="cuota-actual-titulo"]');
    expect(bloque().querySelector('app-loading-layout')).not.toBeNull();
    cuentas.cargandoInicial.set(false);
    cuentas.errorCarga.set('No se pudieron consultar las cuotas');
    await f.whenStable();
    expect(bloque().textContent).toContain('No se pudieron consultar las cuotas');
    expect(bloque().textContent).not.toContain('Todavía no hay cuota emitida');
  });
  it('muestra datos existentes, saldo y secciones preparadas sin recarga forzada', async () => {
    TestBed.overrideComponent(AlumnoFicha, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    const text = f.nativeElement.textContent;
    expect(text).toContain('ana@example.com');
    expect(text).toMatch(/5[.,]000/);
    expect(
      Array.from(f.nativeElement.querySelectorAll('[role=tab]')).map((t: any) =>
        t.textContent.trim(),
      ),
    ).toEqual(['Resumen', 'Finanzas', 'Documentos', 'Entrenamiento']);
    expect(cuentas.refrescarSiNecesario).toHaveBeenCalledOnce();
    expect(cuentas.recargar).not.toHaveBeenCalled();
    for (const seccion of ['personales', 'adicional', 'mensual'] as const) {
      f.componentInstance.editar(seccion);
      expect(open).toHaveBeenCalledWith(
        AlumnoForm,
        expect.objectContaining({ data: { alumno: ana, seccion } }),
      );
    }
    const tabs = f.nativeElement.querySelectorAll('[role=tab]');
    tabs[1].click();
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('Mensualidad');
    expect(f.nativeElement.textContent).toContain('Nuevo movimiento');
    expect(f.nativeElement.textContent).toContain('Registrar pago');
    expect(f.nativeElement.querySelector('app-cobros-directos')).toBeNull();
    expect(f.nativeElement.textContent).toContain('Clase');
    tabs[2].click();
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('Adjuntar documento');
    expect(f.nativeElement.querySelector('input[type=file]').multiple).toBe(true);
    tabs[3].click();
    await f.whenStable();
    expect(f.nativeElement.querySelector('app-alumno-entrenamiento')).not.toBeNull();
  });
  it('conserva la ficha durante una actualización y oculta el saldo si falla la carga', async () => {
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    cuentas.cargando.set(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('mat-tab-group')).not.toBeNull();
    expect(f.nativeElement.querySelector('app-loading-layout')).toBeNull();
    cuentas.errorCarga.set('Sin conexión');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sin conexión');
    expect(f.nativeElement.textContent).not.toContain('Saldo pendiente:');
    alumnos.cargandoInicial.set(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-loading-layout')).not.toBeNull();
    alumnos.cargandoInicial.set(false);
    alumnos.alumnos.set([]);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No se encontró el alumno');
  });
  it('identifica al alumno y muestra cero real, datos vacíos y mensual sin configurar', async () => {
    alumnos.alumnos.set([
      {
        ...ana,
        estado: 'Inactivo',
        telefono: ' ',
        email: '',
        observaciones: '',
        configuracionMensual: undefined,
      },
    ]);
    cuentas.saldoAlumno.mockReturnValue(0);
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    expect(f.nativeElement.querySelector('.student-avatar').textContent.trim()).toBe('AP');
    expect(
      f.nativeElement.querySelector('.student-header .badge--vencido').textContent.trim(),
    ).toBe('Inactivo');
    const metrics = f.nativeElement.querySelector('.summary-metrics').textContent;
    expect(metrics).toContain('No configurada');
    expect(metrics).toContain('0.00');
    expect(f.nativeElement.querySelectorAll('.summary-data .wide dd')[0].textContent.trim()).toBe(
      'Sin completar',
    );
    expect(f.nativeElement.querySelector('.summary').textContent).not.toMatch(/null|undefined/);
    expect(
      f.nativeElement
        .querySelector('[aria-label="Editar configuración mensual"]')
        .textContent.trim(),
    ).toBe('Configurar');
  });
  it('mantiene la configuración deshabilitada y las observaciones completas sin mezclar saldo con configuración', async () => {
    const observaciones = 'Primera línea\n' + 'Observación completa '.repeat(100);
    alumnos.alumnos.set([
      {
        ...ana,
        observaciones,
        configuracionMensual: {
          habilitada: false,
          importe: 15000,
          diaVencimiento: 10,
          periodoInicio: '2026-09',
        },
      },
    ]);
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    const mensual = f.nativeElement.querySelector(
      '[aria-labelledby="configuracion-mensual-titulo"]',
    );
    expect(mensual.textContent).toContain('Deshabilitada');
    expect(mensual.textContent).toContain('2026-09');
    expect(mensual.textContent).not.toContain('Saldo');
    expect(f.nativeElement.querySelector('.summary-data .wide dd').textContent).toBe(observaciones);
    expect(f.nativeElement.querySelector('.student-header .badge--pagado').textContent.trim()).toBe(
      'Activo',
    );
  });
  it('las acciones de las tarjetas conservan la edición por sección y reflejan datos actualizados del servicio', async () => {
    TestBed.overrideComponent(AlumnoFicha, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    for (const [indice, seccion] of ['personales', 'adicional', 'mensual'].entries()) {
      f.nativeElement.querySelectorAll('.summary-card .section-header button')[indice].click();
      expect(open).toHaveBeenCalledWith(
        AlumnoForm,
        expect.objectContaining({ data: { alumno: ana, seccion } }),
      );
    }
    alumnos.alumnos.set([{ ...ana, nombre: 'Ana editada', telefono: '123456' }]);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.student-identity h3').textContent).toContain(
      'Ana editada',
    );
    expect(
      f.nativeElement.querySelector('[aria-labelledby="informacion-adicional-titulo"]').textContent,
    ).toContain('123456');
    expect(cuentas.recargar).not.toHaveBeenCalled();
  });
  it('vuelve a habilitar las acciones al cerrar un editor para poder editar otra tarjeta', async () => {
    const cierre = new Subject<boolean>();
    open.mockReturnValueOnce({ afterClosed: () => cierre } as any);
    TestBed.overrideComponent(AlumnoFicha, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    const botones = f.nativeElement.querySelectorAll('.summary-card button');
    botones[0].click();
    await f.whenStable();
    expect(botones[1].disabled).toBe(true);
    cierre.next(false);
    await f.whenStable();
    expect(botones[1].disabled).toBe(false);
    botones[1].click();
    expect(open).toHaveBeenCalledTimes(2);
  });
  it('confirma bajas y reactivaciones desde la ficha, sin cerrarla', async () => {
    alumnos.cambiarEstado = vi.fn(async (id: string, estado: string) => {
      alumnos.alumnos.set([{ ...ana, estado }]);
      return true;
    });
    TestBed.overrideComponent(AlumnoFicha, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    await f.componentInstance.cambiarEstado();
    expect(open).toHaveBeenCalledWith(
      ConfirmarAlumno,
      expect.objectContaining({
        data: expect.objectContaining({ titulo: 'Dar de baja', danger: true }),
      }),
    );
    expect(alumnos.cambiarEstado).toHaveBeenCalledWith('a', 'Inactivo');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.student-header .badge').textContent).toContain(
      'Inactivo',
    );
    await f.componentInstance.cambiarEstado();
    expect(alumnos.cambiarEstado).toHaveBeenLastCalledWith('a', 'Activo');
    expect(f.nativeElement.querySelector('mat-tab-group')).not.toBeNull();
  });
  it('cancelar una confirmación no cambia el estado y evita confirmaciones duplicadas', async () => {
    alumnos.cambiarEstado = vi.fn();
    const cierre = new Subject<boolean>();
    open.mockReturnValueOnce({ afterClosed: () => cierre } as any);
    TestBed.overrideComponent(AlumnoFicha, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const c = TestBed.createComponent(AlumnoFicha).componentInstance;
    const pending = c.cambiarEstado();
    await c.cambiarEstado();
    expect(open).toHaveBeenCalledTimes(1);
    cierre.next(false);
    await pending;
    expect(alumnos.cambiarEstado).not.toHaveBeenCalled();
    expect(c.cambiandoEstado()).toBe(false);
  });
  it('muestra fallo de estado sin anunciar éxito ni perder al alumno', async () => {
    alumnos.cambiarEstado = vi.fn(async () => {
      alumnos.error.set('No se pudo confirmar la operación');
      return false;
    });
    TestBed.overrideComponent(AlumnoFicha, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
    const f = TestBed.createComponent(AlumnoFicha);
    await f.whenStable();
    await f.componentInstance.cambiarEstado();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'No se pudo confirmar',
    );
    expect(f.componentInstance.alumno()?.estado).toBe('Activo');
  });
});
