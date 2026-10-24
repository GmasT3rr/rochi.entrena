import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Cuentas } from './cuentas';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuentaForm } from './cuenta-form';
import { GenerarMensual } from './generar-mensual';
import { explicacionesGuia } from '../guia/guia-contenido';

describe('Listado simplificado de cuotas', () => {
  function preparar(mobile = false) {
    const cuotas = [
      {
        id: 'c1',
        alumnoId: 'a',
        alumno: 'Ana Pérez',
        modalidad: 'Online',
        concepto: 'Mensual',
        periodo: '2026-10',
        importe: 100,
        abonado: 20,
        saldo: 80,
        estado: 'Vencida',
        vencimiento: '2026-10-10',
        pagos: [],
        observaciones: '',
      },
      {
        id: 'c2',
        alumnoId: 'b',
        alumno: 'José Ruiz',
        modalidad: 'Presencial',
        concepto: 'Mensual',
        periodo: '2026-09',
        importe: 50,
        abonado: 0,
        saldo: 50,
        estado: 'Vencida',
        vencimiento: '2026-09-10',
        pagos: [],
        observaciones: '',
      },
      {
        id: 'c3',
        alumnoId: 'a',
        alumno: 'Ana Pérez',
        modalidad: 'Online',
        concepto: 'Extra',
        periodo: '2026-10',
        importe: 40,
        abonado: 40,
        saldo: 0,
        estado: 'Pagada',
        vencimiento: '2026-10-30',
        pagos: [],
        observaciones: '',
      },
    ];
    const service = {
      hoy: signal('2026-10-24'),
      cuentas: signal(cuotas),
      cuotas: signal(cuotas),
      alumnos: signal([
        { id: 'a', nombre: 'Ana', apellido: 'Pérez' },
        { id: 'b', nombre: 'José', apellido: 'Ruiz' },
      ]),
      pagos: signal([
        { cuotaId: 'c2', fecha: '2026-10-01', importe: 10.25 },
        { cuotaId: 'c1', fecha: '2026-09-30', importe: 20 },
      ]),
      recargar: vi.fn(),
      disponible: signal(true),
      cargando: signal(false),
      guardando: signal(false),
      error: signal(''),
      mensaje: signal(''),
      errorCarga: signal(''),
      filtros: {
        busqueda: signal(''),
        periodo: signal('2026-10'),
        alumnoId: signal(''),
        estado: signal(''),
        modalidad: signal(''),
      },
      orden: signal({ active: 'vencimiento', direction: 'asc' }),
    };
    const dialog = { open: vi.fn(), openDialogs: [] as any[] };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: mobile }) } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: CuentasService, useValue: service },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(Cuentas);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, service, dialog };
  }
  it('separa fecha de pago y período de cuota sin sumar dos veces la deuda vencida', () => {
    const { component } = preparar();
    expect(component.resumen()).toEqual({ cobrado: 10.25, pendiente: 80, vencido: 80 });
    component.estado.set('Pagada');
    expect(component.resumen().pendiente).toBe(80);
    component.periodo.set('2026-09');
    expect(component.resumen()).toEqual({ cobrado: 20, pendiente: 50, vencido: 50 });
    component.limpiarFiltros();
    expect(component.resumen()).toEqual({ cobrado: 30.25, pendiente: 130, vencido: 130 });
  });
  it('combina filtros, incluye deudas históricas y conserva los filtros al cerrar el detalle o recrear la vista', () => {
    const { component, service, fixture } = preparar();
    component.busqueda.set('pérez');
    component.modalidad.set('Online');
    component.estado.set('Vencida');
    expect(component.cuentas().map((c) => c.id)).toEqual(['c1']);
    component.detalle(component.cuentas()[0]);
    expect(component.busqueda()).toBe('pérez');
    fixture.destroy();
    const siguiente = TestBed.createComponent(Cuentas).componentInstance;
    expect(siguiente.periodo()).toBe('2026-10');
    expect(siguiente.estado()).toBe('Vencida');
    expect(siguiente.modalidad()).toBe('Online');
    expect(siguiente.busqueda()).toBe('pérez');
    siguiente.limpiarFiltros();
    expect(siguiente.cuentas()).toHaveLength(3);
    expect(service.filtros.periodo()).toBe('');
  });
  it('muestra cobro directo, detalle e historial y las dos condiciones de una cuota vencida parcial', () => {
    const { fixture, component, dialog } = preparar();
    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Registrar cobro');
    expect(texto).toContain('Con pagos parciales');
    expect(texto).toContain('Vencida');
    expect(fixture.nativeElement.querySelector('a[href="/pendientes"]')).not.toBeNull();
    component.pago(component.cuentas()[0]);
    expect(dialog.open).toHaveBeenCalledWith(
      CuentaForm,
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'pago' }) }),
    );
    dialog.openDialogs.push({ componentInstance: Object.create(CuentaForm.prototype) });
    component.pago(component.cuentas()[0]);
    expect(dialog.open).toHaveBeenCalledTimes(1);
    dialog.openDialogs.length = 0;
    component.pago(component.cuentas().find((c) => c.estado === 'Pagada')!);
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });
  it('mantiene las operaciones accesibles en sus grupos y limpiar incluye todos los períodos', () => {
    const { fixture, component, service, dialog } = preparar();
    const click = (label: string) => {
      const button = [...fixture.nativeElement.querySelectorAll('button')].find(
        (b: any) => b.textContent.trim() === label,
      ) as HTMLButtonElement;
      expect(button).toBeTruthy();
      button.click();
    };
    click('Nueva cuota');
    expect(dialog.open).toHaveBeenCalledWith(CuentaForm, expect.anything());
    click('Generar cuotas del mes');
    expect(dialog.open).toHaveBeenCalledWith(GenerarMensual, expect.anything());
    component.busqueda.set('Ana');
    component.alumnoId.set('a');
    component.estado.set('Vencida');
    component.modalidad.set('Online');
    click('Limpiar filtros');
    expect(component.busqueda()).toBe('');
    expect(component.alumnoId()).toBe('');
    expect(component.periodo()).toBe('');
    expect(component.estado()).toBe('');
    expect(component.modalidad()).toBe('');
    const refresh = fixture.nativeElement.querySelector(
      '.hub-results-toolbar button',
    ) as HTMLButtonElement;
    refresh.click();
    expect(service.recargar).toHaveBeenCalledOnce();
    service.cargando.set(true);
    fixture.detectChanges();
    expect(refresh.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('a[href="/pendientes"]')).toBeTruthy();
  });
  for (const mobile of [false, true]) {
    it(`presenta un único filtro Alumno y conserva acciones de tabla (mobile=${mobile})`, () => {
      const { fixture, component } = preparar(mobile);
      expect(component.filtrosMoviles()).toBe(mobile);
      const labels = [...fixture.nativeElement.querySelectorAll('mat-label')].filter(
        (e: any) => e.textContent.trim() === 'Alumno',
      );
      expect(labels).toHaveLength(1);
      expect(!!fixture.nativeElement.querySelector('mat-expansion-panel')).toBe(mobile);
      const actions = fixture.nativeElement.querySelector('.desktop-table .row-actions');
      expect(actions.querySelectorAll('button')).toHaveLength(4);
      expect(actions.querySelector('button[aria-label^="Editar cuota"]')).toBeTruthy();
      expect(actions.querySelector('button[aria-label^="Eliminar cuota"]')).toBeTruthy();
    });
  }
  it('la guía explica la acción real, los filtros y la confirmación al corregir pagos', () => {
    expect(explicacionesGuia.find((s) => s.id === 'registrar-cobro')?.pasos.join(' ')).toContain(
      'Registrar cobro',
    );
    expect(explicacionesGuia.find((s) => s.id === 'filtros-cuotas')?.pasos.join(' ')).toContain(
      'Limpiar filtros',
    );
    expect(explicacionesGuia.find((s) => s.id === 'corregir-cuota')?.pasos.join(' ')).toContain(
      'confirmá la corrección',
    );
  });
});
