import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  Cuota,
  PagoCuota,
  fechaValida,
  periodoValido,
  importeValido,
  centavos,
} from '../../core/cuentas';
import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { ConfirmarAlumno } from '../alumnos/confirmar-alumno';

export type CuentaFormData =
  { tipo: 'cuota'; cuota?: Cuota } | { tipo: 'pago'; cuota: Cuota; pago?: PagoCuota };
const dinero = (c: AbstractControl) => (importeValido(c.value) ? null : { importe: true });
const fecha = (c: AbstractControl) => (fechaValida(c.value) ? null : { fecha: true });
const periodo = (c: AbstractControl) => (periodoValido(c.value) ? null : { periodo: true });
@Component({
  selector: 'app-cuenta-form',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './cuenta-form.html',
  styleUrl: './cuenta-form.scss',
})
export class CuentaForm {
  readonly data = inject<CuentaFormData>(MAT_DIALOG_DATA);
  readonly service = inject(CuentasService);
  readonly alumnos = inject(AlumnosService);
  private readonly ref = inject(MatDialogRef<CuentaForm>);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  readonly error = signal('');
  readonly confirmando = signal(false);
  readonly pago = this.data.tipo === 'pago' ? this.data.pago : undefined;
  readonly cuotaForm = this.fb.nonNullable.group({
    alumnoId: [this.data.cuota?.alumnoId ?? '', Validators.required],
    concepto: [
      this.data.cuota?.concepto ?? '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(150)],
    ],
    periodo: [this.data.cuota?.periodo ?? this.service.hoy().slice(0, 7), periodo],
    importe: [this.data.cuota?.importe ?? (null as number | null), [Validators.required, dinero]],
    vencimiento: [this.data.cuota?.vencimiento ?? this.service.hoy(), fecha],
    observaciones: [this.data.cuota?.observaciones ?? '', Validators.maxLength(3000)],
  });
  readonly pagoForm = this.fb.nonNullable.group({
    importe: [this.pago?.importe ?? (null as number | null), [Validators.required, dinero]],
    fecha: [this.pago?.fecha ?? this.service.hoy(), fecha],
    medio: [this.pago?.medio ?? ('Transferencia' as PagoCuota['medio']), Validators.required],
    observaciones: [this.pago?.observaciones ?? '', Validators.maxLength(3000)],
  });
  readonly titulo =
    this.data.tipo === 'cuota'
      ? this.data.cuota
        ? 'Editar cuota'
        : 'Nueva cuota'
      : this.pago
        ? 'Editar pago'
        : 'Registrar pago';
  get disponible(): number {
    const cuenta = this.service.cuentas().find((c) => c.id === this.data.cuota?.id);
    return ((cuenta ? centavos(cuenta.saldo) : 0) + centavos(this.pago?.importe ?? 0)) / 100;
  }
  guardar(): void {
    this.error.set('');
    const form = this.data.tipo === 'cuota' ? this.cuotaForm : this.pagoForm;
    form.markAllAsTouched();
    if (form.invalid || this.confirmando()) return;
    if (this.data.tipo === 'pago' && this.pago) {
      this.confirmando.set(true);
      this.dialog
        .open(ConfirmarAlumno, {
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
          data: {
            titulo: 'Confirmar edición del pago',
            mensaje: '¿Confirmás corregir este pago? Se recalcularán el saldo y los ingresos.',
          },
        })
        .afterClosed()
        .subscribe((ok) => {
          this.confirmando.set(false);
          if (ok) this.persistir();
        });
    } else this.persistir();
  }
  private persistir(): void {
    let ok: boolean;
    if (this.data.tipo === 'cuota') {
      const values = this.cuotaForm.getRawValue();
      ok = this.service.guardarCuota({ ...values, importe: values.importe! }, this.data.cuota?.id);
    } else {
      const values = this.pagoForm.getRawValue();
      ok = this.service.guardarPago(
        { ...values, importe: values.importe!, cuotaId: this.data.cuota.id },
        this.pago?.id,
      );
    }
    if (ok) this.ref.close(true);
    else this.error.set(this.service.error());
  }
}
