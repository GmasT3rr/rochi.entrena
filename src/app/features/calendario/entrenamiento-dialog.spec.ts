import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EntrenamientoDialog, EntrenamientoDialogData } from './entrenamiento-dialog';
import { AgendaMemoria, AgendaRepository, duracionHorario, turnoValido } from './agenda';
import { AlumnosService } from '../../core/services/alumnos-service';
import { ToastService } from '../../core/services/toast-service';

const valido = () =>
  ({ invalid: false, control: { markAllAsTouched: vi.fn() } }) as unknown as NgForm;
describe('Formulario modal de entrenamientos', () => {
  it('mantiene el modal abierto y bloqueado hasta confirmar la escritura remota', async () => {
    const { c, repo, ref } = await setup();
    c.borrador.alumnoIds = ['a'];
    let resolver!: (n: number) => void;
    const operacion = new Promise<number>((resolve) => (resolver = resolve));
    const guardar = vi.spyOn(repo as AgendaRepository, 'guardar').mockReturnValue(operacion);
    const pendiente = c.guardar(valido());
    await c.guardar(valido());
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(c.ocupado()).toBe(true);
    expect((ref as any).disableClose).toBe(true);
    expect(ref.close).not.toHaveBeenCalled();
    resolver(1);
    await pendiente;
    expect(ref.close).toHaveBeenCalledTimes(1);
    expect(c.ocupado()).toBe(false);
  });
  it('conserva datos y confirmación cuando falla una operación remota', async () => {
    const { c, repo, ref } = await setup();
    c.borrador.alumnoIds = ['a'];
    c.borrador.titulo = 'Conservar';
    vi.spyOn(repo as AgendaRepository, 'guardar').mockRejectedValue({
      code: '40001',
      message: 'private server text',
    });
    await c.guardar(valido());
    expect(c.error()).toContain('Los datos cambiaron');
    expect(c.borrador.titulo).toBe('Conservar');
    expect(ref.close).not.toHaveBeenCalled();
    expect(c.ocupado()).toBe(false);
    c.data.turno = { ...c.borrador, id: 't', estado: 'programado', version: 'version' };
    c.confirmarCancelacion.set(true);
    vi.spyOn(repo as AgendaRepository, 'cancelar').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
    await c.cancelarTurno();
    expect(c.error()).toContain('conexión');
    expect(c.confirmarCancelacion()).toBe(true);
    expect(ref.close).not.toHaveBeenCalled();
  });
  async function setup(data: EntrenamientoDialogData = { fecha: '2026-10-26', inicio: '09:00' }) {
    const repo = new AgendaMemoria(),
      ref = { close: vi.fn() },
      toast = { mostrar: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: ref },
        { provide: AgendaRepository, useValue: repo },
        { provide: ToastService, useValue: toast },
        {
          provide: AlumnosService,
          useValue: {
            alumnos: signal([
              { id: 'a', nombre: 'Ana', apellido: 'Pérez' },
              { id: 'b', nombre: 'Luis', apellido: 'Gómez' },
            ]),
            cargando: signal(false),
            errorListado: signal(''),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EntrenamientoDialog);
    await fixture.whenStable();
    return { c: fixture.componentInstance, fixture, repo, ref, toast };
  }
  it('calcula duración por horario, admite medianoche y rechaza fin anterior', () => {
    expect(duracionHorario('09:15', '10:00')).toBe(45);
    expect(duracionHorario('23:30', '00:00')).toBe(30);
    expect(duracionHorario('09:00', '08:00')).toBeLessThan(0);
    expect(duracionHorario('25:00', '10:00')).toBeNaN();
  });
  it('guarda grupo y título opcional, repite solo dentro del mes y evita doble envío', async () => {
    const { c, repo, ref } = await setup();
    c.borrador.alumnoIds = ['a', 'b'];
    c.borrador.titulo = '  Fuerza  ';
    c.finalizacion = '10:30';
    c.repeticion = [1, 3];
    await c.guardar(valido());
    await c.guardar(valido());
    expect(repo.listar().map((t) => t.fecha)).toEqual(['2026-10-26', '2026-10-28']);
    expect(repo.listar()[0]).toMatchObject({
      titulo: 'Fuerza',
      duracion: 90,
      alumnoIds: ['a', 'b'],
    });
    expect(ref.close).toHaveBeenCalledTimes(1);
  });
  it('no cierra con formulario inválido, fin anterior, fecha fuera del mes ni alumnos inválidos', async () => {
    const { c, ref, repo } = await setup();
    const form = { ...valido(), invalid: true } as NgForm;
    await c.guardar(form);
    expect(form.control.markAllAsTouched).toHaveBeenCalled();
    c.borrador.alumnoIds = ['a'];
    c.finalizacion = '08:00';
    await c.guardar(valido());
    c.finalizacion = '10:00';
    c.borrador.fecha = '2026-11-01';
    await c.guardar(valido());
    c.borrador.fecha = '2026-10-26';
    c.borrador.alumnoIds = ['desconocido'];
    await c.guardar(valido());
    expect(ref.close).not.toHaveBeenCalled();
    expect(repo.listar()).toHaveLength(0);
    expect(c.error()).toBeTruthy();
  });
  it('advierte superposición y conserva modal abierto hasta aceptar; no permite duplicar alumnos', async () => {
    const { c, repo, ref } = await setup();
    repo.guardar({ ...c.borrador, alumnoIds: ['a'] });
    c.borrador.inicio = '09:30';
    c.finalizacion = '10:30';
    c.borrador.alumnoIds = ['b'];
    expect(c.superposiciones()).toHaveLength(1);
    await c.guardar(valido());
    expect(ref.close).not.toHaveBeenCalled();
    expect(c.error()).toContain('superpuestos');
    c.aceptarSuperposicion = true;
    c.borrador.alumnoIds = ['a'];
    await c.guardar(valido());
    expect(ref.close).not.toHaveBeenCalled();
    c.borrador.alumnoIds = ['b'];
    await c.guardar(valido());
    expect(repo.listar()).toHaveLength(2);
  });
  it('edita desde detalles usando el mismo formulario sin mutar el turno al descartar', async () => {
    const turno = {
      id: 't',
      fecha: '2026-10-26',
      inicio: '23:30',
      duracion: 30,
      modalidad: 'Online' as const,
      alumnoIds: ['a'],
      observaciones: '',
      estado: 'programado' as const,
      titulo: 'Fuerza',
    };
    const { c, repo, ref } = await setup({
      fecha: turno.fecha,
      inicio: turno.inicio,
      turno,
      detalles: true,
    });
    repo.guardar(turno);
    const existente = repo.listar()[0];
    c.data.turno!.id = existente.id;
    expect(c.finalizacion).toBe('00:00');
    c.editar();
    expect(c.modo()).toBe('formulario');
    c.borrador.alumnoIds.push('b');
    expect(turno.alumnoIds).toEqual(['a']);
    await c.guardar(valido());
    expect(repo.listar()).toHaveLength(1);
    expect(repo.listar()[0].alumnoIds).toEqual(['a', 'b']);
    expect(ref.close).toHaveBeenCalled();
  });
  it('requiere confirmación para cancelar sin crear otro modal', async () => {
    const { c, repo, ref } = await setup();
    repo.guardar({ ...c.borrador, alumnoIds: ['a'] });
    c.data.turno = repo.listar()[0];
    await c.cancelarTurno();
    expect(ref.close).not.toHaveBeenCalled();
    c.confirmarCancelacion.set(true);
    await c.cancelarTurno();
    expect(repo.listar()[0].estado).toBe('cancelado');
    expect(ref.close).toHaveBeenCalled();
  });
  it('muestra los errores al enviar el formulario real y mantiene sus campos', async () => {
    const { fixture, c, ref } = await setup();
    c.borrador.titulo = 'Prueba';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(ref.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(c.borrador.titulo).toBe('Prueba');
    expect(turnoValido({ ...c.borrador, alumnoIds: ['a'], titulo: 'x'.repeat(121) })).toBe(false);
  });
});
