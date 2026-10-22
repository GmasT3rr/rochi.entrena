import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { importeValido } from '../../core/cuentas';
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
  readonly service = inject(AlumnosService);
  private readonly ref = inject(MatDialogRef<AlumnoForm>);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  readonly confirmando = signal(false);
  // Reutilizar el ID al reintentar una alta cuyo resultado de red sea incierto.
  private readonly nuevoId = crypto.randomUUID();
  private readonly hoy = new Date();
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
    fechaIngreso: [
      this.alumno?.fechaIngreso ??
        `${this.hoy.getFullYear()}-${String(this.hoy.getMonth() + 1).padStart(2, '0')}-${String(this.hoy.getDate()).padStart(2, '0')}`,
      Validators.required,
    ],
    observaciones: [this.alumno?.observaciones ?? '', Validators.maxLength(3000)],
    habilitarMensual: [this.alumno?.configuracionMensual?.habilitada ?? false],
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
    this.actualizarCobro(this.form.controls.habilitarMensual.value);
    this.form.controls.habilitarMensual.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((habilitada) => this.actualizarCobro(habilitada));
  }

  private actualizarCobro(habilitada: boolean): void {
    for (const control of [this.form.controls.importeMensual, this.form.controls.diaVencimiento]) {
      if (habilitada) control.enable();
      else control.disable();
    }
  }

  async guardar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.confirmando() || this.service.guardando()) return;
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
    const anteriorDisableClose = this.ref.disableClose;
    this.ref.disableClose = true;
    try {
      const { habilitarMensual, importeMensual, diaVencimiento, ...datos } = this.form.getRawValue();
      const configuracionMensual = habilitarMensual
        ? { habilitada: true, importe: importeMensual!, diaVencimiento: diaVencimiento! }
        : this.alumno?.configuracionMensual
          ? { ...this.alumno.configuracionMensual, habilitada: false }
          : undefined;
      const guardado = this.alumno
        ? await this.service.guardar({ ...datos, configuracionMensual }, this.alumno.id)
        : await this.service.guardar({ ...datos, configuracionMensual }, undefined, this.nuevoId);
      if (guardado) this.ref.close(true);
    } finally { this.ref.disableClose = anteriorDisableClose; }
  }
}
