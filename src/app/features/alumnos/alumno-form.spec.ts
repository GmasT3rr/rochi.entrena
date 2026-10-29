import { EMPTY } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AlumnoForm, AlumnoFormData } from './alumno-form';
import { AlumnoRegistro } from '../../core/alumno';
import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { DocumentosAlumnosRepository } from '../../core/services/documentos-alumnos-repository';
import { fechaArgentina } from '../../core/services/cuentas-remotas-service';
import { PerfilesEntrenamientoRepository } from '../../core/services/perfiles-entrenamiento-repository';
import { CAMPOS_PERFIL } from '../../core/perfil-entrenamiento';

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
  const subir = vi.fn();
  const guardarPerfil = vi.fn();
  const config = { max_bytes: 10485760, max_archivos: 10, formatos: { pdf: 'application/pdf' } };
  beforeEach(() => {
    guardar.mockReset().mockResolvedValue(true);
    subir.mockReset().mockResolvedValue(undefined);
    guardarPerfil.mockReset().mockResolvedValue({});
  });
  async function formulario(alumno: AlumnoFormData = null) {
    const close = vi.fn();
    const service = {
      alumnos: signal(alumno ? ['alumno' in alumno ? alumno.alumno : alumno] : []),
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
        {
          provide: CuentasService,
          useValue: {
            recargar: vi.fn().mockResolvedValue(undefined),
            disponible: signal(true),
            errorCarga: signal(''),
            cuotasAlumno: () => [],
            versionCuota: () => undefined,
          },
        },
        { provide: PerfilesEntrenamientoRepository, useValue: { guardar: guardarPerfil } },
        {
          provide: DocumentosAlumnosRepository,
          useValue: {
            configuracion: vi.fn(async () => config),
            listar: vi.fn(async () => ({ config, documentos: [] })),
            subir,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AlumnoForm);
    fixture.componentInstance.form.patchValue({ nombre: 'Nueva', apellido: 'Alumna' });
    fixture.detectChanges();
    return { fixture, form: fixture.componentInstance, close, service };
  }
  it('presenta cuatro paneles opcionales uniformes y cerrados en el alta', async () => {
    const { fixture } = await formulario();
    const paneles = Array.from(
      fixture.nativeElement.querySelectorAll('.optional-sections > mat-expansion-panel'),
    ) as HTMLElement[];
    expect(paneles).toHaveLength(4);
    expect(paneles.map((p) => p.querySelector('mat-panel-title')!.textContent!.trim())).toEqual([
      'Información adicional (opcional)',
      'Configuración mensual (opcional)',
      'Perfil de entrenamiento (opcional)',
      'Documentos (opcional)',
    ]);
    expect(paneles.every((p) => p.classList.contains('hub-filter-extra'))).toBe(true);
    expect(
      paneles.every(
        (p) =>
          p.querySelector('mat-expansion-panel-header')!.getAttribute('aria-expanded') === 'false',
      ),
    ).toBe(true);
    expect(fixture.nativeElement.querySelector('.optional-sections > section')).toBeNull();
    expect(paneles[1].textContent).toContain('Podés generar las cuotas');
  });
  it('edita datos personales sin mostrar ni sobrescribir las otras secciones', async () => {
    const registro = {
      ...anterior,
      telefono: '123',
      email: 'ana@example.com',
      observaciones: 'Nota',
      configuracionMensual: {
        habilitada: true,
        importe: 100,
        diaVencimiento: 10,
        periodoInicio: '2027-02',
      },
    };
    const { form, fixture, service } = await formulario({
      alumno: registro,
      seccion: 'personales',
    });
    service.alumnos.set([{ ...registro, telefono: '456' }]);
    form.form.patchValue({ nombre: 'Editada', telefono: 'valor oculto', importeMensual: 300 });
    await form.guardar();
    expect(fixture.nativeElement.querySelector('[formControlName=telefono]')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-expansion-panel')).toBeNull();
    expect(guardar.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        nombre: 'Editada',
        telefono: '456',
        email: registro.email,
        configuracionMensual: registro.configuracionMensual,
      }),
    );
  });
  it('edita adicionales sin alterar el estado ni la configuración y permite vaciarlos', async () => {
    const registro = {
      ...anterior,
      telefono: '123',
      observaciones: 'Nota',
      configuracionMensual: {
        habilitada: true,
        importe: 100,
        diaVencimiento: 10,
        periodoInicio: '2027-02',
      },
    };
    const { form, fixture } = await formulario({ alumno: registro, seccion: 'adicional' });
    form.form.patchValue({
      telefono: '',
      email: 'ana@example.com',
      observaciones: '',
      estado: 'Inactivo',
      importeMensual: 300,
    });
    await form.guardar();
    expect(fixture.nativeElement.querySelector('[formControlName=nombre]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('mat-expansion-panel')).toHaveLength(1);
    expect(guardar.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        nombre: registro.nombre,
        estado: 'Activo',
        telefono: '',
        observaciones: '',
        email: 'ana@example.com',
        configuracionMensual: registro.configuracionMensual,
      }),
    );
  });
  it('edita y deshabilita mensual desde su sección sin generar cuotas ni cambiar datos personales', async () => {
    const registro = {
      ...anterior,
      configuracionMensual: {
        habilitada: true,
        importe: 100,
        diaVencimiento: 10,
        periodoInicio: '2027-02',
      },
    };
    const { form, fixture } = await formulario({ alumno: registro, seccion: 'mensual' });
    expect(fixture.nativeElement.querySelector('[formControlName=nombre]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('mat-expansion-panel')).toHaveLength(1);
    form.form.patchValue({ importeMensual: 250, diaVencimiento: 15, primerPeriodo: '2027-03' });
    await form.guardar();
    expect(guardar.mock.calls[0]).toEqual([
      expect.objectContaining({
        nombre: registro.nombre,
        configuracionMensual: {
          habilitada: true,
          importe: 250,
          diaVencimiento: 15,
          periodoInicio: '2027-03',
        },
      }),
      registro.id,
    ]);
    form.form.controls.habilitarMensual.setValue(false);
    await form.guardar();
    expect(guardar.mock.calls[1][0].configuracionMensual.habilitada).toBe(false);
    expect(guardar.mock.calls[1]).toHaveLength(2);
  });
  it('no presenta errores al habilitar mensual hasta interactuar o intentar guardar; abre el panel inválido', async () => {
    const { form, fixture } = await formulario();
    form.form.controls.habilitarMensual.setValue(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-error')).toBeNull();
    await form.guardar();
    fixture.detectChanges();
    expect(form.mensualAbierta()).toBe(true);
    expect(fixture.nativeElement.querySelector('mat-error')).not.toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });
  it('permite alta mínima con valores iniciales y sección adicional cerrada', async () => {
    const { form, fixture } = await formulario();
    expect(form.form.controls.estado.value).toBe('Activo');
    expect(form.form.controls.fechaIngreso.value).toBe(fechaArgentina());
    expect(
      fixture.nativeElement
        .querySelector('mat-expansion-panel-header')
        .getAttribute('aria-expanded'),
    ).toBe('false');
    await form.guardar();
    expect(guardar.mock.calls[0][0]).toEqual(
      expect.objectContaining({ telefono: '', email: '', observaciones: '' }),
    );
    expect(subir).not.toHaveBeenCalled();
    expect(guardarPerfil).not.toHaveBeenCalled();
  });
  it('permite abrir el perfil vacío sin obligar a completarlo ni crear una fila de perfil', async () => {
    const { form, fixture } = await formulario();
    (
      Array.from(fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')).find(
        (h: any) => h.textContent.includes('Perfil de entrenamiento'),
      ) as HTMLElement
    ).click();
    await fixture.whenStable();
    expect(form.perfilCampos()!.datos().edad_declarada).toBeNull();
    await form.guardar();
    expect(guardarPerfil).not.toHaveBeenCalled();
  });
  it('valida perfil parcial antes del alta y no duplica al alumno si falla el perfil con documentos guardados', async () => {
    const { form, fixture, close } = await formulario();
    const abrir = async (texto: string) => {
      (
        Array.from(fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')).find(
          (h: any) => h.textContent.includes(texto),
        ) as HTMLElement
      ).click();
      await fixture.whenStable();
    };
    await abrir('Perfil de entrenamiento');
    form.perfilCampos()!.form.get('altura_cm')!.setValue(-1);
    await form.guardar();
    expect(guardar).not.toHaveBeenCalled();
    form.perfilCampos()!.form.get('altura_cm')!.setValue(null);
    form.perfilCampos()!.form.get('ciudad')!.setValue('Rosario');
    await abrir('Documentos');
    form
      .documentos()!
      .seleccionar({ files: [new File(['x'], 'a.pdf')], value: '' } as unknown as HTMLInputElement);
    guardarPerfil.mockRejectedValueOnce(Error('Perfil sin confirmar'));
    await form.guardar();
    expect(form.alumnoCreado()).toBe(true);
    expect(guardarPerfil).toHaveBeenCalledWith(
      guardar.mock.calls[0][2],
      expect.objectContaining({ ciudad: 'Rosario', edad_declarada: null }),
      null,
    );
    expect(form.errorPerfilAlta()).toContain('sin confirmar');
    expect(subir).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await form.guardar();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardarPerfil).toHaveBeenCalledTimes(2);
    expect(subir).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(true);
  });
  it('alta con perfil completo conserva el perfil confirmado al reintentar documentos', async () => {
    const { form, fixture, close } = await formulario();
    (
      Array.from(fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')).find(
        (h: any) => h.textContent.includes('Perfil de entrenamiento'),
      ) as HTMLElement
    ).click();
    await fixture.whenStable();
    for (const c of CAMPOS_PERFIL)
      form
        .perfilCampos()!
        .form.get(c.clave)!
        .setValue(
          c.tipo === 'numero'
            ? c.min! > 0
              ? c.min!
              : 1
            : c.tipo === 'booleano'
              ? false
              : c.tipo === 'selector'
                ? c.opciones![0]!
                : 'Declarado',
        );
    (
      Array.from(fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')).find(
        (h: any) => h.textContent.includes('Documentos'),
      ) as HTMLElement
    ).click();
    await fixture.whenStable();
    form
      .documentos()!
      .seleccionar({ files: [new File(['x'], 'a.pdf')], value: '' } as unknown as HTMLInputElement);
    subir.mockRejectedValueOnce(Error('Red'));
    await form.guardar();
    expect(form.perfilGuardado()).toBe(true);
    expect(close).not.toHaveBeenCalled();
    await form.guardar();
    expect(guardarPerfil).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(true);
  });
  it('comparte todos los datos adicionales con edición y abre el panel si hay errores', async () => {
    const { form } = await formulario();
    form.form.patchValue({ telefono: '12345', email: 'inválido', observaciones: 'Nota existente' });
    await form.guardar();
    expect(guardar).not.toHaveBeenCalled();
    expect(form.adicionalAbierta()).toBe(true);
    form.form.controls.email.setValue('ana@example.com');
    await form.guardar();
    expect(guardar.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        telefono: '12345',
        email: 'ana@example.com',
        observaciones: 'Nota existente',
      }),
    );
  });
  it('crea una sola vez, informa cada archivo y reintenta solo fallidos conservando ID', async () => {
    const { form, fixture, close } = await formulario();
    (
      Array.from(fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')).find(
        (h: any) => h.textContent.includes('Documentos'),
      ) as HTMLElement
    ).click();
    await fixture.whenStable();
    const documentos = form.documentos()!;
    documentos.seleccionar({
      files: [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')],
      value: '',
    } as unknown as HTMLInputElement);
    subir.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('Sin conexión'));
    form.form.patchValue({ habilitarMensual: true, importeMensual: 1000, diaVencimiento: 15 });
    await form.guardar();
    fixture.detectChanges();
    const alumnoId = guardar.mock.calls[0][2];
    const idArchivo = subir.mock.calls[1][3].id;
    expect(form.alumnoCreado()).toBe(true);
    expect(form.form.disabled).toBe(true);
    expect(form.form.controls.importeMensual.disabled).toBe(true);
    expect(guardar.mock.calls[0][3]).toBe(form.form.controls.primerPeriodo.value);
    expect(close).not.toHaveBeenCalled();
    expect(documentos.archivos().map((f) => f.estado)).toEqual(['guardado', 'error']);
    expect(fixture.nativeElement.textContent).toContain('El alumno ya fue creado');
    expect(fixture.nativeElement.textContent).toContain('b.pdf');
    expect(fixture.nativeElement.textContent).toContain('Sin conexión');
    await form.guardar();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(subir).toHaveBeenCalledTimes(3);
    expect(subir.mock.calls[2][0]).toBe(alumnoId);
    expect(subir.mock.calls[2][3]).toEqual({ id: idArchivo, reintento: true });
    expect(close).toHaveBeenCalledWith(true);
  });
  it('no sube archivos si falla el alta; permite finalizar conservando al alumno creado', async () => {
    const { form, fixture, close } = await formulario();
    (
      Array.from(fixture.nativeElement.querySelectorAll('mat-expansion-panel-header')).find(
        (h: any) => h.textContent.includes('Documentos'),
      ) as HTMLElement
    ).click();
    await fixture.whenStable();
    form
      .documentos()!
      .seleccionar({ files: [new File(['x'], 'a.pdf')], value: '' } as unknown as HTMLInputElement);
    guardar.mockResolvedValueOnce(false);
    await form.guardar();
    expect(subir).not.toHaveBeenCalled();
    subir.mockRejectedValueOnce(Error('Permiso denegado'));
    await form.guardar();
    expect(form.alumnoCreado()).toBe(true);
    expect(close).not.toHaveBeenCalled();
    form.finalizarAlta();
    expect(close).toHaveBeenCalledWith(true);
    expect(guardar.mock.calls[0][2]).toBe(guardar.mock.calls[1][2]);
  });
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
