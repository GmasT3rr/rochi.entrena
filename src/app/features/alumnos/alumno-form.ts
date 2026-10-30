import { ErrorUsuario, mensajeError } from '../../core/services/mensajes-usuario';
import { PeriodSelector } from '../../shared/period-selector';
import { DestroyRef } from '@angular/core';
import { CambiosPendientes } from '../../core/services/cambios-pendientes';
import { ToastService } from '../../core/services/toast-service';
import { Component, inject, signal, viewChild, Injector, computed, effect } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuentaVista, cuotasMensualesDelPeriodo, validarCuentas } from '../../core/cuentas';
import { VersionFinanciera } from '../../core/services/cuentas-supabase-repository';
import { PerfilCampos } from './perfil-campos';
import {
  DatosPerfilEntrenamiento,
  tieneDatosPerfil,
  perfilVacio,
} from '../../core/perfil-entrenamiento';
import { PerfilesEntrenamientoRepository } from '../../core/services/perfiles-entrenamiento-repository';
import { MatExpansionModule } from '@angular/material/expansion';
import { DocumentosAlta } from './documentos-alta';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { importeValido, periodoValido } from '../../core/cuentas';
import { fechaArgentina } from '../../core/services/cuentas-remotas-service';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  AlumnoRegistro,
  DatosAlumno,
  EstadoRegistroAlumno,
  ModalidadAlumno,
} from '../../core/alumno';
import { AlumnosService } from '../../core/services/alumnos-service';
import { ConfirmarAlumno } from './confirmar-alumno';

export type SeccionAlumno = 'personales' | 'adicional' | 'mensual';
export type AlumnoFormData =
  AlumnoRegistro | { alumno: AlumnoRegistro; seccion: SeccionAlumno } | null;

@Component({
  selector: 'app-alumno-form',
  imports: [
    CurrencyPipe,
    PeriodSelector,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatExpansionModule,
    DocumentosAlta,
    PerfilCampos,
  ],
  templateUrl: './alumno-form.html',
  styleUrl: './alumno-form.scss',
})
export class AlumnoForm {
  private readonly data = inject<AlumnoFormData>(MAT_DIALOG_DATA);
  readonly alumno = this.data && 'alumno' in this.data ? this.data.alumno : this.data;
  readonly seccion = this.data && 'seccion' in this.data ? this.data.seccion : null;
  readonly titulo =
    this.seccion === 'personales'
      ? 'Editar datos personales'
      : this.seccion === 'adicional'
        ? 'Editar información adicional'
        : this.seccion === 'mensual'
          ? 'Editar configuración mensual'
          : this.alumno
            ? 'Editar alumno'
            : 'Agregar alumno';
  private readonly toast = inject(ToastService);
  readonly service = inject(AlumnosService);
  private readonly ref = inject(MatDialogRef<AlumnoForm>);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  readonly confirmando = signal(false);
  readonly enviando = signal(false);
  readonly errorGuardado = signal('');
  readonly alumnoCreado = signal(false);
  readonly documentos = viewChild(DocumentosAlta);
  readonly adicionalAbierta = signal(!!this.alumno);
  readonly mensualAbierta = signal(
    this.seccion === 'mensual' || !!this.alumno?.configuracionMensual?.habilitada,
  );
  readonly perfilCampos = viewChild(PerfilCampos);
  readonly perfilAbierto = signal(false);
  readonly perfilGuardado = signal(false);
  readonly errorPerfilAlta = signal('');
  private perfilAlta: DatosPerfilEntrenamiento | null = null;
  private readonly injector = inject(Injector);
  readonly detalleGuardado = signal<ReturnType<AlumnosService['detalleError']>>(null);
  // Reutilizar el ID al reintentar una alta cuyo resultado de red sea incierto.
  private readonly nuevoId = crypto.randomUUID();
  private readonly hoy = fechaArgentina();
  readonly periodoActual = this.hoy.slice(0, 7);
  readonly aplicarActual = signal(false);
  readonly preparandoCuota = signal(false);
  readonly errorCuotaActual = signal('');
  readonly cuotaActualConsultada = signal(false);
  readonly candidatasActuales = signal<CuentaVista[]>([]);
  readonly cuotaActual = computed(() =>
    this.candidatasActuales().length === 1 ? this.candidatasActuales()[0] : undefined,
  );
  private versionCuotaActual: VersionFinanciera | undefined;
  private consultaCuota = 0;
  readonly form = this.fb.nonNullable.group({
    nombre: [
      this.alumno?.nombre ?? '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)],
    ],
    apellido: [
      this.alumno?.apellido ?? '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)],
    ],
    telefono: [
      this.alumno?.telefono ?? '',
      [Validators.pattern(/^[+\d\s().-]*$/), Validators.maxLength(40)],
    ],
    email: [this.alumno?.email ?? '', [Validators.email, Validators.maxLength(254)]],
    modalidad: [this.alumno?.modalidad ?? ('Presencial' as ModalidadAlumno), Validators.required],
    estado: [this.alumno?.estado ?? ('Activo' as EstadoRegistroAlumno), Validators.required],
    fechaIngreso: [this.alumno?.fechaIngreso ?? this.hoy, Validators.required],
    observaciones: [this.alumno?.observaciones ?? '', Validators.maxLength(3000)],
    habilitarMensual: [this.alumno?.configuracionMensual?.habilitada ?? false],
    crearPrimeraCuota: [true],
    primerPeriodo: [
      this.alumno?.configuracionMensual?.periodoInicio ?? this.hoy.slice(0, 7),
      (c: AbstractControl) => (periodoValido(c.value) ? null : { periodo: true }),
    ],
    importeMensual: this.fb.control<number | null>(
      this.alumno?.configuracionMensual?.importe ?? null,
      [
        Validators.required,
        (c: AbstractControl) => (importeValido(c.value) ? null : { importe: true }),
      ],
    ),
    diaVencimiento: this.fb.control<number | null>(
      this.alumno?.configuracionMensual?.diaVencimiento ?? null,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(31),
        (c: AbstractControl) => (Number.isInteger(c.value) ? null : { dia: true }),
      ],
    ),
  });
  private readonly importeEditado = toSignal(this.form.controls.importeMensual.valueChanges, {
    initialValue: this.form.controls.importeMensual.value,
  });
  private readonly mensualHabilitada = toSignal(this.form.controls.habilitarMensual.valueChanges, {
    initialValue: this.form.controls.habilitarMensual.value,
  });
  readonly cambioImporteConfiguracion = computed(
    () =>
      importeValido(this.importeEditado()) &&
      this.importeEditado() !== this.alumno?.configuracionMensual?.importe,
  );
  readonly cuotaActualDifiere = computed(() => {
    const cuota = this.cuotaActual();
    return (
      this.cuotaActualConsultada() &&
      !this.errorCuotaActual() &&
      !!cuota &&
      importeValido(this.importeEditado()) &&
      cuota.importe !== this.importeEditado()
    );
  });
  readonly cuotaActualElegible = computed(
    () => this.cuotaActualDifiere() && this.cuotaActual()?.estado !== 'Pagada',
  );
  readonly mostrarAplicacion = computed(
    () =>
      this.seccion === 'mensual' &&
      !!this.alumno &&
      this.mensualHabilitada() &&
      importeValido(this.importeEditado()) &&
      (this.cambioImporteConfiguracion() || this.cuotaActualElegible()),
  );
  readonly bloqueoCuotaActual = computed(() => {
    if (!this.aplicarActual() || !this.mostrarAplicacion()) return '';
    if (this.preparandoCuota()) return 'Consultando la cuota actual…';
    if (this.errorCuotaActual()) return this.errorCuotaActual();
    if (this.candidatasActuales().length > 1)
      return 'Hay más de una cuota mensual posible. No se elegirá una arbitrariamente.';
    const c = this.cuotaActual();
    if (c?.estado === 'Pagada')
      return 'La cuota está pagada. Cualquier corrección debe realizarse expresamente desde Editar cuota. Podés aplicar la configuración solo a cuotas futuras.';
    if (c && !this.versionCuotaActual)
      return 'No se pudo verificar la versión de la cuota. Actualizá antes de guardar.';
    if (this.alumno?.configuracionMensual && !this.alumno.configuracionMensual.actualizadoEn)
      return 'Actualizá la ficha para obtener la versión de la configuración antes de aplicar a la cuota actual.';
    if (c && importeValido(this.importeEditado())) {
      try {
        validarCuentas({
          version: 1,
          cuotas: [{ ...c, importe: this.importeEditado()! }],
          pagos: c.pagos,
        });
      } catch (e) {
        return mensajeError(e);
      }
    }
    return '';
  });

  async seleccionarAplicacion(actual: boolean): Promise<void> {
    this.aplicarActual.set(actual);
    if (
      actual &&
      !this.preparandoCuota() &&
      (!this.cuotaActualConsultada() || this.errorCuotaActual())
    )
      await this.consultarCuotaActual();
  }

  async consultarCuotaActual(): Promise<void> {
    const consulta = ++this.consultaCuota;
    this.errorCuotaActual.set('');
    this.preparandoCuota.set(true);
    try {
      const cuentas = this.injector.get(CuentasService);
      await cuentas.recargar();
      if (consulta !== this.consultaCuota) return;
      if (cuentas.errorCarga() || !cuentas.disponible())
        throw new ErrorUsuario(
          'No se pudo verificar la cuota actual. Reintentá la consulta antes de guardar.',
        );
      const candidatas = cuotasMensualesDelPeriodo(
        cuentas.cuotasAlumno(this.alumno!.id),
        this.alumno!.id,
        this.periodoActual,
      );
      this.versionCuotaActual =
        candidatas.length === 1 ? cuentas.versionCuota(candidatas[0].id) : undefined;
      this.candidatasActuales.set(candidatas);
      this.cuotaActualConsultada.set(true);
    } catch (e) {
      if (consulta === this.consultaCuota) this.errorCuotaActual.set(mensajeError(e));
    } finally {
      if (consulta === this.consultaCuota) this.preparandoCuota.set(false);
    }
  }

  constructor() {
    inject(CambiosPendientes).proteger(
      this.ref,
      () => ({
        datos: this.form.getRawValue(),
        aplicarActual: this.aplicarActual(),
        perfil: this.perfilCampos()?.form.getRawValue() ?? perfilVacio(),
        archivos:
          this.documentos()
            ?.archivos()
            .map((f) => f.id) ?? [],
      }),
      () => this.service.guardando() || this.confirmando() || this.enviando(),
      inject(DestroyRef),
    );
    this.actualizarCobro(this.form.controls.habilitarMensual.value);
    this.form.controls.habilitarMensual.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((habilitada) => this.actualizarCobro(habilitada));
    this.form.controls.crearPrimeraCuota.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.actualizarPrimerPeriodo());
    if (this.seccion) {
      const campos = {
        personales: ['nombre', 'apellido', 'modalidad', 'estado', 'fechaIngreso'],
        adicional: ['telefono', 'email', 'observaciones'],
        mensual: ['habilitarMensual', 'importeMensual', 'diaVencimiento', 'primerPeriodo'],
      }[this.seccion];
      for (const [clave, control] of Object.entries(this.form.controls))
        if (!campos.includes(clave)) control.disable({ emitEvent: false });
    }
    if (this.seccion === 'mensual' && this.alumno) {
      void this.consultarCuotaActual();
      effect(() => {
        const cuota = this.cuotaActual();
        if (cuota && cuota.importe === this.importeEditado() && this.aplicarActual())
          this.aplicarActual.set(false);
      });
    }
  }

  private actualizarPrimerPeriodo(): void {
    const habilitado =
      (!this.seccion || this.seccion === 'mensual') && this.form.controls.habilitarMensual.value;
    if (habilitado) this.form.controls.primerPeriodo.enable();
    else this.form.controls.primerPeriodo.disable();
  }

  private actualizarCobro(habilitada: boolean): void {
    habilitada = habilitada && (!this.seccion || this.seccion === 'mensual');
    this.actualizarPrimerPeriodo();
    for (const control of [this.form.controls.importeMensual, this.form.controls.diaVencimiento]) {
      if (habilitada) control.enable();
      else control.disable();
    }
  }

  async guardar(): Promise<void> {
    if (this.confirmando() || this.enviando() || this.service.guardando()) return;
    if (this.alumnoCreado()) {
      await this.reintentarComplementos();
      return;
    }
    this.errorGuardado.set('');
    this.detalleGuardado.set(null);
    if (this.bloqueoCuotaActual()) {
      this.errorGuardado.set(this.bloqueoCuotaActual());
      return;
    }
    this.form.markAllAsTouched();
    if (this.perfilCampos() && !this.perfilCampos()!.validar()) {
      this.perfilAbierto.set(true);
      this.toast.mostrar('Revisá los campos del perfil de entrenamiento.', 'advertencia');
      return;
    }
    if (this.form.invalid) {
      if (
        ['importeMensual', 'diaVencimiento', 'primerPeriodo'].some((k) => this.form.get(k)?.invalid)
      )
        this.mensualAbierta.set(true);
      if (['telefono', 'email', 'observaciones'].some((k) => this.form.get(k)?.invalid))
        this.adicionalAbierta.set(true);
      this.toast.mostrar('Revisá los campos marcados antes de guardar.', 'advertencia');
    }
    if (this.form.invalid || this.confirmando() || this.enviando() || this.service.guardando())
      return;
    const estado =
      this.seccion && this.seccion !== 'personales'
        ? this.alumno!.estado
        : this.form.getRawValue().estado;
    if (
      this.alumno &&
      estado !== this.alumno.estado &&
      (estado === 'Inactivo' || this.alumno.estado === 'Inactivo')
    ) {
      this.confirmando.set(true);
      this.dialog
        .open(ConfirmarAlumno, {
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          data: {
            titulo: estado === 'Inactivo' ? 'Dar de baja' : 'Reactivar alumno',
            mensaje: `¿Confirmás cambiar el estado de ${this.alumno.nombre} ${this.alumno.apellido} a ${estado}?`,
          },
        })
        .afterClosed()
        .subscribe((confirmado) => {
          this.confirmando.set(false);
          if (confirmado) this.persistir();
        });
    } else await this.persistir();
  }

  private async persistir(): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(true);
    const anteriorDisableClose = this.ref.disableClose;
    this.ref.disableClose = true;
    try {
      const {
        habilitarMensual,
        importeMensual,
        diaVencimiento,
        primerPeriodo,
        crearPrimeraCuota,
        ...datos
      } = this.form.getRawValue();
      const configuracionMensual = habilitarMensual
        ? {
            habilitada: true,
            importe: importeMensual!,
            diaVencimiento: diaVencimiento!,
            // El período de primera cuota ya viaja en p_periodo. No exigir la
            // columna de Cron para guardar la configuración mensual básica.
            ...(this.alumno?.configuracionMensual?.periodoInicio !== undefined ||
            (primerPeriodo !== this.hoy.slice(0, 7) && (this.alumno || !crearPrimeraCuota))
              ? { periodoInicio: primerPeriodo }
              : {}),
          }
        : this.alumno?.configuracionMensual
          ? { ...this.alumno.configuracionMensual, habilitada: false }
          : undefined;
      const perfil = this.perfilCampos()?.datos();
      this.perfilAlta = perfil && tieneDatosPerfil(perfil) ? perfil : null;
      let datosGuardado: DatosAlumno = { ...datos, configuracionMensual };
      if (this.alumno && this.seccion) {
        const actual = this.service.alumnos().find((a) => a.id === this.alumno!.id) ?? this.alumno;
        const { id, proximaCuota, ...original } = actual;
        datosGuardado =
          this.seccion === 'personales'
            ? {
                ...original,
                nombre: datos.nombre,
                apellido: datos.apellido,
                modalidad: datos.modalidad,
                estado: datos.estado,
                fechaIngreso: datos.fechaIngreso,
              }
            : this.seccion === 'adicional'
              ? {
                  ...original,
                  telefono: datos.telefono,
                  email: datos.email,
                  observaciones: datos.observaciones,
                }
              : { ...original, configuracionMensual };
      }
      const guardado =
        this.mostrarAplicacion() &&
        this.aplicarActual() &&
        (!this.cuotaActual() || this.cuotaActualDifiere())
          ? await this.service.guardarMensualConCuota(this.alumno!.id, configuracionMensual!, {
              periodo: this.periodoActual,
              cuotaId: this.cuotaActual()?.id ?? null,
              versionCuota: this.versionCuotaActual,
              versionConfiguracion: this.alumno!.configuracionMensual?.actualizadoEn ?? null,
            })
          : this.alumno
            ? await this.service.guardar(datosGuardado, this.alumno.id)
            : habilitarMensual && crearPrimeraCuota
              ? await this.service.guardar(
                  { ...datos, configuracionMensual },
                  undefined,
                  this.nuevoId,
                  primerPeriodo,
                )
              : await this.service.guardar(
                  { ...datos, configuracionMensual },
                  undefined,
                  this.nuevoId,
                );
      if (guardado) {
        if (!this.alumno && (this.documentos()?.archivos().length || this.perfilAlta)) {
          this.alumnoCreado.set(true);
          this.form.disable({ emitEvent: false });
          if (await this.guardarComplementos()) {
            this.ref.close(true);
          }
        } else this.ref.close(true);
      } else {
        this.errorGuardado.set(this.service.error());
        this.detalleGuardado.set(this.service.detalleError());
      }
    } finally {
      this.enviando.set(false);
      this.ref.disableClose = anteriorDisableClose;
    }
  }
  private async guardarComplementos(): Promise<boolean> {
    let perfilOK = true;
    if (this.perfilAlta && !this.perfilGuardado()) {
      this.errorPerfilAlta.set('');
      try {
        await this.injector
          .get(PerfilesEntrenamientoRepository)
          .guardar(this.nuevoId, this.perfilAlta, null);
        this.perfilGuardado.set(true);
      } catch (e) {
        this.errorPerfilAlta.set(mensajeError(e));
        perfilOK = false;
      }
    }
    const docs = this.documentos();
    const docsOK = docs?.archivos().some((f) => f.estado !== 'guardado')
      ? await docs.subir(this.nuevoId)
      : true;
    return perfilOK && docsOK;
  }
  private async reintentarComplementos(): Promise<void> {
    this.enviando.set(true);
    try {
      if (await this.guardarComplementos()) {
        this.toast.mostrar('Información adicional guardada en el alumno creado.', 'exito');
        this.ref.close(true);
      }
    } finally {
      this.enviando.set(false);
    }
  }
  finalizarAlta(): void {
    if (this.alumnoCreado() && !this.enviando()) this.ref.close(true);
  }
}
