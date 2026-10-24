import { PeriodSelector } from '../../shared/period-selector';
import { DestroyRef } from '@angular/core';
import { CambiosPendientes } from '../../core/services/cambios-pendientes';
import { ToastService } from '../../core/services/toast-service';
import { Component, inject, signal } from '@angular/core';
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
import { AlumnoRegistro, EstadoRegistroAlumno, ModalidadAlumno } from '../../core/alumno';
import { AlumnosService } from '../../core/services/alumnos-service';
import { ConfirmarAlumno } from './confirmar-alumno';

@Component({
  selector: 'app-alumno-form',
  imports: [
    PeriodSelector,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
  ],
  templateUrl: './alumno-form.html',
  styleUrl: './alumno-form.scss',
})
export class AlumnoForm {
  readonly alumno = inject<AlumnoRegistro | null>(MAT_DIALOG_DATA);
  private readonly toast = inject(ToastService);
  readonly service = inject(AlumnosService);
  private readonly ref = inject(MatDialogRef<AlumnoForm>);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  readonly confirmando = signal(false);
  readonly enviando = signal(false);
  readonly errorGuardado = signal('');
  readonly detalleGuardado = signal<ReturnType<AlumnosService['detalleError']>>(null);
  // Reutilizar el ID al reintentar una alta cuyo resultado de red sea incierto.
  private readonly nuevoId = crypto.randomUUID();
  private readonly hoy = fechaArgentina();
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

  constructor() {
    inject(CambiosPendientes).proteger(
      this.ref,
      () => this.form.getRawValue(),
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
  }

  private actualizarPrimerPeriodo(): void {
    const habilitado = this.form.controls.habilitarMensual.value;
    if (habilitado) this.form.controls.primerPeriodo.enable();
    else this.form.controls.primerPeriodo.disable();
  }

  private actualizarCobro(habilitada: boolean): void {
    this.actualizarPrimerPeriodo();
    for (const control of [this.form.controls.importeMensual, this.form.controls.diaVencimiento]) {
      if (habilitada) control.enable();
      else control.disable();
    }
  }

  async guardar(): Promise<void> {
    if (this.confirmando() || this.enviando() || this.service.guardando()) return;
    this.errorGuardado.set('');
    this.detalleGuardado.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid)
      this.toast.mostrar('Revisá los campos marcados antes de guardar.', 'advertencia');
    if (this.form.invalid || this.confirmando() || this.enviando() || this.service.guardando())
      return;
    const estado = this.form.getRawValue().estado;
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
      const guardado = this.alumno
        ? await this.service.guardar({ ...datos, configuracionMensual }, this.alumno.id)
        : habilitarMensual && crearPrimeraCuota
          ? await this.service.guardar(
              { ...datos, configuracionMensual },
              undefined,
              this.nuevoId,
              primerPeriodo,
            )
          : await this.service.guardar({ ...datos, configuracionMensual }, undefined, this.nuevoId);
      if (guardado) this.ref.close(true);
      else {
        this.errorGuardado.set(this.service.error());
        this.detalleGuardado.set(this.service.detalleError());
      }
    } finally {
      this.enviando.set(false);
      this.ref.disableClose = anteriorDisableClose;
    }
  }
}
