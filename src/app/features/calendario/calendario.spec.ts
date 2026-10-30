import { AgendaMemoria, AgendaRepository } from './agenda';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Calendario } from './calendario';
import { AlumnosService } from '../../core/services/alumnos-service';
import { ToastService } from '../../core/services/toast-service';
import { AlumnoFicha } from '../alumnos/alumno-ficha';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { EntrenamientoDialog } from './entrenamiento-dialog';

describe('Calendario con modal de entrenamiento', () => {
  it('carga el mes pequeño y la semana visible sin volver a consultar al elegir un día del mismo rango', async () => {
    const { component, fixture } = await setup();
    component.seleccionarFecha('2026-09-01');
    await fixture.whenStable();
    const cargar = vi.spyOn(component.agenda, 'cargar');
    component.seleccionarFecha('2026-10-30');
    await fixture.whenStable();
    expect(cargar).toHaveBeenLastCalledWith('2026-10-01', '2026-11-01');
    const llamadas = cargar.mock.calls.length;
    component.seleccionarFecha('2026-10-29');
    await fixture.whenStable();
    expect(cargar).toHaveBeenCalledTimes(llamadas);
    component.vista.set('dia');
    await fixture.whenStable();
    expect(cargar).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31');
  });
  async function setup(mobile = false) {
    TestBed.configureTestingModule({
      providers: [
        { provide: BreakpointObserver, useValue: { observe: () => of({ matches: mobile }) } },
        {
          provide: AlumnosService,
          useValue: {
            alumnos: signal([{ id: 'a', nombre: 'Ana', apellido: 'Pérez' }]),
            cargando: signal(false),
            errorListado: signal(''),
            refrescarSiNecesario: vi.fn(),
          },
        },
        { provide: ToastService, useValue: { mostrar: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(Calendario, {
      set: {
        providers: [AgendaMemoria, { provide: AgendaRepository, useExisting: AgendaMemoria }],
      },
    });
    const fixture = TestBed.createComponent(Calendario);
    await fixture.whenStable();
    const dialog = TestBed.inject(MatDialog);
    return { fixture, component: fixture.componentInstance, dialog };
  }
  afterEach(() => TestBed.inject(MatDialog).closeAll());
  it('abre desde el calendario lateral con fecha seleccionada y el botón usa el mismo modal', async () => {
    const { component, fixture, dialog } = await setup();
    component.cambiarMes('2026-10');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[aria-label^="2026-10-02:"]').click();
    await fixture.whenStable();
    expect(component.fecha()).toBe('2026-10-02');
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(EntrenamientoDialog);
    expect(dialog.openDialogs[0].componentInstance.borrador.fecha).toBe('2026-10-02');
    dialog.closeAll();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    await fixture.whenStable();
    fixture.nativeElement.querySelector('app-page-header button').click();
    await fixture.whenStable();
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance.borrador.fecha).toBe('2026-10-02');
  });
  it('precarga fecha/hora desde celda de otro mes, enfoca el modal y restaura el foco', async () => {
    const { component, fixture, dialog } = await setup();
    component.seleccionarFecha('2026-10-30');
    fixture.detectChanges();
    const celda = fixture.nativeElement.querySelector(
      '[data-celda="2026-11-01_14:30"]',
    ) as HTMLButtonElement;
    celda.click();
    await fixture.whenStable();
    const modal = dialog.openDialogs[0].componentInstance as EntrenamientoDialog;
    expect(modal.borrador.fecha).toBe('2026-11-01');
    expect(modal.borrador.inicio).toBe('14:30');
    expect(modal.finalizacion).toBe('15:30');
    expect(document.activeElement?.textContent).toContain('Nuevo entrenamiento');
    component.abrir();
    expect(dialog.openDialogs).toHaveLength(1);
    modal.ref.close();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement === celda).toBe(true));
  });
  it('ordena bloques y abre ficha solo después de cerrar los detalles', async () => {
    const { component, fixture, dialog } = await setup();
    component.seleccionarFecha('2026-10-01');
    for (const inicio of ['21:00', '10:00', '08:00', '15:00'])
      component.agenda.guardar({
        fecha: '2026-10-01',
        inicio,
        duracion: 60,
        modalidad: 'Online',
        alumnoIds: ['a'],
        observaciones: '',
      });
    expect(
      component
        .columnas()
        .find((c) => c.fecha === '2026-10-01')!
        .bloques.map((b) => b.turno.inicio),
    ).toEqual(['08:00', '10:00', '15:00', '21:00']);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.evento').click();
    await fixture.whenStable();
    const modal = dialog.openDialogs[0].componentInstance as EntrenamientoDialog;
    expect(modal.modo()).toBe('detalles');
    const open = vi.spyOn(dialog, 'open').mockImplementation(() => {
      expect(dialog.openDialogs).toHaveLength(0);
      return { afterClosed: () => of(undefined) } as any;
    });
    modal.ficha('a');
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    await fixture.whenStable();
    expect(open).toHaveBeenCalledWith(AlumnoFicha, expect.objectContaining({ data: 'a' }));
  });
  it('navega por días, semanas, meses y Hoy sin generar turnos', async () => {
    const { component } = await setup();
    expect(component.vistaEfectiva()).toBe('semana');
    component.seleccionarFecha('2026-12-30');
    component.navegar(1);
    expect(component.fecha()).toBe('2027-01-06');
    component.vista.set('dia');
    component.navegar(-1);
    expect(component.fecha()).toBe('2027-01-05');
    component.vista.set('mes');
    component.navegar(1);
    expect(component.periodo()).toBe('2027-02');
    component.irHoy();
    expect(component.fecha()).toBe(component.hoy);
    expect(component.agenda.listar()).toEqual([]);
  });
  it('adapta la semana al móvil y conserva vista mensual', async () => {
    const { component, fixture } = await setup(true);
    expect(component.dias()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.mini-panel').open).toBe(false);
    component.vista.set('mes');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vista-mes')).toBeTruthy();
  });
  it('navega celdas por teclado con un único acceso Tab', async () => {
    const { component, fixture } = await setup();
    component.seleccionarFecha('2026-10-01');
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('[data-celda="2026-10-01_09:00"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-celda')).toBe('2026-10-01_09:30');
    expect(fixture.nativeElement.querySelectorAll('.celda-hora[tabindex="0"]')).toHaveLength(1);
  });
});
