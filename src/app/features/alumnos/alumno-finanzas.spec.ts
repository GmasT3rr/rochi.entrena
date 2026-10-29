import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AlumnoFinanzas } from './alumno-finanzas';
import { CuentasService } from '../../core/services/cuentas-service';
import { CobrosDirectosAcciones } from '../cuentas/cobros-directos-acciones';
import { CuentaForm } from '../cuentas/cuenta-form';
import { CuentaVista } from '../../core/cuentas';

const cuota: CuentaVista = {
  id: 'c',
  alumnoId: 'a',
  alumno: 'Ana',
  modalidad: 'Online',
  concepto: 'Mensualidad',
  periodo: '2026-10',
  importe: 1000,
  vencimiento: '2026-10-10',
  saldo: 750,
  abonado: 250,
  estado: 'Parcial',
  observaciones: '',
  pagos: [
    {
      id: 'p',
      cuotaId: 'c',
      importe: 250,
      fecha: '2026-10-01',
      medio: 'Efectivo',
      observaciones: '',
    },
  ],
};
const directo = {
  id: 'd',
  alumnoId: 'a',
  concepto: 'Clase',
  importe: 200,
  fecha: '2026-10-15',
  medio: 'Otro',
  observaciones: '',
};
describe('Finanzas compactas del alumno', () => {
  const open = vi.fn(),
    abrir = vi.fn();
  const cuotas = signal([cuota]);
  const cobros = signal([directo, { ...directo, id: 'ajeno', alumnoId: 'b' }]);
  const cargando = signal(false),
    error = signal('');
  beforeEach(() => {
    open.mockReset();
    abrir.mockReset();
    cuotas.set([cuota]);
    cobros.set([directo, { ...directo, id: 'ajeno', alumnoId: 'b' }]);
    cargando.set(false);
    error.set('');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CuentasService,
          useValue: {
            cuotasAlumno: (id: string) => cuotas().filter((c) => c.alumnoId === id),
            cobrosDirectos: cobros,
            alumnos: signal([]),
            saldoAlumno: () => 750,
            cargandoInicial: signal(false),
            cargando,
            errorCarga: error,
            tieneDatos: signal(true),
            guardando: signal(false),
            disponible: () => !cargando(),
            recargar: vi.fn(),
          },
        },
        { provide: CobrosDirectosAcciones, useValue: { abrir } },
      ],
    });
    TestBed.overrideComponent(AlumnoFinanzas, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
  });
  async function crear() {
    const f = TestBed.createComponent(AlumnoFinanzas);
    f.componentRef.setInput('alumno', 'a');
    await f.whenStable();
    return f;
  }
  it('unifica cuotas y directos, sin sumar pagos como filas o mostrar deuda para directos', async () => {
    const f = await crear(),
      c = f.componentInstance;
    expect(c.pendientes()).toBe(1);
    expect(c.movimientos().map((m) => m.clave)).toEqual(['directo:d', 'cuota:c']);
    const filas = f.nativeElement.querySelectorAll('.movement');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Importe recibido');
    expect(filas[0].textContent).not.toContain('Vence');
    expect(filas[0].textContent).not.toContain('Saldo');
    expect(filas[1].textContent).toContain('Parcial');
    expect(filas[1].textContent).toContain('750');
    expect(filas[1].textContent).toMatch(/1[.,]000/);
    expect(f.nativeElement.querySelectorAll('mat-form-field')).toHaveLength(0);
    expect(f.nativeElement.textContent).not.toContain('Exportar');
  });
  it('reutiliza formularios con alumno preseleccionado, detalle y pagos contextuales', async () => {
    const c = (await crear()).componentInstance;
    c.nuevaCuota();
    expect(open).toHaveBeenCalledWith(
      CuentaForm,
      expect.objectContaining({ data: { tipo: 'cuota', alumnoId: 'a' } }),
    );
    c.cobroDirecto();
    expect(abrir).toHaveBeenCalledWith(undefined, 'a');
    c.editar(c.movimientos()[0]);
    expect(abrir).toHaveBeenCalledWith(directo, 'a');
    c.editar(c.movimientos()[1]);
    expect(open).toHaveBeenCalledWith(
      CuentaForm,
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'cuota' }) }),
    );
    c.pago(cuota);
    expect(open).toHaveBeenCalledWith(
      CuentaForm,
      expect.objectContaining({ data: { tipo: 'pago', cuota } }),
    );
    open.mockClear();
    c.pago({ ...cuota, saldo: 0 });
    expect(open).not.toHaveBeenCalled();
    cargando.set(true);
    c.nuevaCuota();
    c.pago(cuota);
    expect(open).not.toHaveBeenCalled();
  });
  it('actualiza sin reemplazar las filas por skeleton y muestra error o vacío', async () => {
    const f = await crear();
    cargando.set(true);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.movement')).toHaveLength(2);
    expect(f.nativeElement.querySelector('app-loading-layout')).toBeNull();
    error.set('Sin conexión');
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('Sin conexión');
    expect(f.nativeElement.querySelector('.movement')).toBeNull();
    error.set('');
    cuotas.set([]);
    cobros.set([]);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Todavía no hay cuotas');
  });
  it('agrupa estados de cuotas y ofrece pago solo cuando existe saldo', async () => {
    cuotas.set([
      { ...cuota, id: 'pagada', estado: 'Pagada', saldo: 0 },
      { ...cuota, id: 'vencida', estado: 'Vencida', saldo: 100 },
      { ...cuota, id: 'pendiente', estado: 'Pendiente', saldo: 50 },
    ]);
    cobros.set([]);
    const f = await crear();
    expect(f.componentInstance.pendientes()).toBe(2);
    expect(f.nativeElement.querySelectorAll('.finance-summary app-stat-card')).toHaveLength(2);
    expect(f.nativeElement.querySelector('.badge--pagado').textContent.trim()).toBe('Pagada');
    expect(f.nativeElement.querySelector('.badge--vencido').textContent.trim()).toBe('Vencida');
    expect(f.nativeElement.querySelector('.badge--pendiente').textContent.trim()).toBe('Pendiente');
    const pagos = Array.from(f.nativeElement.querySelectorAll('.movement button')).filter(
      (b: any) => b.textContent.includes('Registrar pago'),
    );
    expect(pagos).toHaveLength(2);
    expect(f.nativeElement.querySelectorAll('.movement')).toHaveLength(3);
  });
});
