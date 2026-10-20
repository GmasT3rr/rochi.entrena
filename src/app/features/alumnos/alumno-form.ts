import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  });

  guardar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.confirmando()) return;
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
    } else this.persistir();
  }

  private persistir(): void {
    if (this.service.guardar(this.form.getRawValue(), this.alumno?.id)) this.ref.close(true);
  }
}
