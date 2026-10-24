import { EMPTY } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AlumnoForm } from './alumno-form';
import { AlumnoRegistro } from '../../core/alumno';
import { AlumnosService } from '../../core/services/alumnos-service';

const anterior: AlumnoRegistro = {
  id: 'previo',
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: '',
  email: '',
  modalidad: 'Online',
  estado: 'Activo',
  fechaIngreso: '2026-10-01',
  observaciones: '',
};

describe('Formulario remoto de alumnos', () => {
  const guardar = vi.fn();
  beforeEach(() => guardar.mockReset().mockResolvedValue(true));
  async function formulario(alumno: AlumnoRegistro | null = null) {
    const close = vi.fn();
    const service = {
      guardar,
      guardando: signal(false),
      cargando: signal(false),
      error: signal(''),
      detalleError: signal<any>(null),
    };
    TestBed.configureTestingModule({
      imports: [AlumnoForm],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: alumno },
        {
          provide: MatDialogRef,
          useValue: {
            close,
            disableClose: false,
            backdropClick: () => EMPTY,
            keydownEvents: () => EMPTY,
          },
        },
        { provide: AlumnosService, useValue: service },
      ],
    });
    const fixture = TestBed.createComponent(AlumnoForm);
    fixture.componentInstance.form.patchValue({ nombre: 'Nueva', apellido: 'Alumna' });
    fixture.detectChanges();
    return { fixture, form: fixture.componentInstance, close, service };
  }
  it('crea sin configuración mensual y espera confirmación antes de cerrar', async () => {
    const { form, close } = await formulario();
    let resolve!: (v: boolean) => void;
    guardar.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    const pending = form.guardar();
    expect(close).not.toHaveBeenCalled();
    resolve(true);
    await pending;
    expect(close).toHaveBeenCalledWith(true);
    expect(guardar.mock.calls[0][0].configuracionMensual).toBeUndefined();
  });
  it('conserva validaciones y guarda importe/día al habilitar', async () => {
    const { form, close } = await formulario();
    form.form.controls.habilitarMensual.setValue(true);
    await form.guardar();
    expect(close).not.toHaveBeenCalled();
    for (const importe of [0, -1, 0.001, null]) {
      form.form.patchValue({ importeMensual: importe, diaVencimiento: 15 });
      expect(form.form.invalid).toBe(true);
    }
    for (const dia of [0, 32, 1.5, null]) {
      form.form.patchValue({ importeMensual: 20000, diaVencimiento: dia });
      expect(form.form.invalid).toBe(true);
    }
    form.form.patchValue({ importeMensual: 23456.78, diaVencimiento: 31 });
    await form.guardar();
    expect(guardar.mock.calls[0][0].configuracionMensual).toEqual({
      habilitada: true,
      importe: 23456.78,
      diaVencimiento: 31,
    });
  });
  it('deshabilita sin perder importe ni día anteriores', async () => {
    const { form } = await formulario({
      ...anterior,
      configuracionMensual: { habilitada: true, importe: 30000, diaVencimiento: 10 },
    });
    form.form.patchValue({ importeMensual: null, diaVencimiento: null, habilitarMensual: false });
    await form.guardar();
    expect(guardar.mock.calls[0]).toEqual([
      expect.objectContaining({
        configuracionMensual: { habilitada: false, importe: 30000, diaVencimiento: 10 },
      }),
      anterior.id,
    ]);
  });
  it('no cierra el diálogo ni permite doble envío si falla o sigue guardando', async () => {
    const { form, close, service } = await formulario();
    guardar.mockResolvedValue(false);
    await form.guardar();
    expect(close).not.toHaveBeenCalled();
    service.guardando.set(true);
    await form.guardar();
    expect(guardar).toHaveBeenCalledTimes(1);
  });
  it('reutiliza el ID de alta al reintentar un resultado incierto de red', async () => {
    const { form } = await formulario();
    guardar.mockResolvedValue(false);
    await form.guardar();
    await form.guardar();
    expect(guardar.mock.calls[0][2]).toBeTruthy();
    expect(guardar.mock.calls[1][2]).toBe(guardar.mock.calls[0][2]);
  });
  it('no hereda errores de lectura y mantiene el error de su propio guardado', async () => {
    const { form, fixture, service, close } = await formulario();
    service.error.set('Falló una consulta del listado');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeNull();
    guardar.mockResolvedValueOnce(false);
    service.error.set('No está disponible la RPC de primera cuota');
    service.detalleError.set({
      codigo: 'PGRST202',
      estadoHttp: 404,
      recurso: 'crear_alumno_con_primera_cuota',
      operacion: 'Guardar alumno',
      mensaje: 'Could not find the function',
    });
    form.form.patchValue({
      habilitarMensual: true,
      importeMensual: 100,
      diaVencimiento: 31,
      primerPeriodo: '2028-02',
    });
    const datos = form.form.getRawValue();
    await form.guardar();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(form.form.getRawValue()).toEqual(datos);
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'RPC de primera cuota',
    );
    expect(fixture.nativeElement.textContent).toContain('PGRST202');
    service.error.set('Otro error de fondo');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).not.toContain('fondo');
    await form.guardar();
    expect(close).toHaveBeenCalledWith(true);
    expect(guardar.mock.calls[0][2]).toBe(guardar.mock.calls[1][2]);
  });
  it('activa primera cuota por defecto, valida mes/año y envía un único período', async () => {
    const { form, fixture } = await formulario();
    expect(form.form.controls.primerPeriodo.disabled).toBe(true);
    form.form.patchValue({ habilitarMensual: true, importeMensual: 100, diaVencimiento: 31 });
    fixture.detectChanges();
    expect(form.form.controls.crearPrimeraCuota.value).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Crear primera cuota al guardar');
    form.form.controls.primerPeriodo.setValue('2026-13');
    await form.guardar();
    expect(guardar).not.toHaveBeenCalled();
    form.form.controls.primerPeriodo.setValue('2028-02');
    await form.guardar();
    expect(guardar.mock.calls[0][3]).toBe('2028-02');
    expect(guardar.mock.calls[0][0]).not.toHaveProperty('primerPeriodo');
    expect(guardar.mock.calls[0][0]).not.toHaveProperty('crearPrimeraCuota');
  });
  it('no crea primera cuota al desmarcarla ni al editar', async () => {
    const { form } = await formulario();
    form.form.patchValue({
      habilitarMensual: true,
      importeMensual: 100,
      diaVencimiento: 10,
      crearPrimeraCuota: false,
      primerPeriodo: '2028-02',
    });
    expect(form.form.controls.primerPeriodo.enabled).toBe(true);
    await form.guardar();
    expect(guardar.mock.calls[0]).toHaveLength(3);
    expect(guardar.mock.calls[0][0].configuracionMensual.periodoInicio).toBe('2028-02');
  });
  it('oculta la primera cuota en edición y conserva el contrato sin crear cuotas', async () => {
    const { form, fixture } = await formulario({
      ...anterior,
      configuracionMensual: {
        habilitada: true,
        importe: 100,
        diaVencimiento: 31,
        periodoInicio: '2028-02',
      },
    });
    expect(fixture.nativeElement.textContent).not.toContain('Crear primera cuota al guardar');
    expect(form.form.controls.primerPeriodo.enabled).toBe(true);
    await form.guardar();
    expect(guardar.mock.calls[0]).toHaveLength(2);
    expect(guardar.mock.calls[0][0].configuracionMensual.periodoInicio).toBe('2028-02');
  });
  it('bloquea doble clic localmente y mantiene campos e ID tras un fallo', async () => {
    const { form, close } = await formulario();
    form.form.patchValue({
      habilitarMensual: true,
      importeMensual: 100,
      diaVencimiento: 31,
      primerPeriodo: '2028-02',
    });
    let resolver!: (ok: boolean) => void;
    guardar.mockReturnValueOnce(new Promise<boolean>((r) => (resolver = r)));
    const valores = form.form.getRawValue();
    const pendiente = form.guardar();
    await form.guardar();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(form.enviando()).toBe(true);
    expect(close).not.toHaveBeenCalled();
    resolver(false);
    await pendiente;
    expect(form.form.getRawValue()).toEqual(valores);
    expect(form.enviando()).toBe(false);
    await form.guardar();
    expect(guardar.mock.calls[1][2]).toBe(guardar.mock.calls[0][2]);
    expect(guardar.mock.calls[1][3]).toBe('2028-02');
  });
});
