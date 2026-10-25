import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { CuentasService } from '../../core/services/cuentas-service';
import { CobroDirecto } from '../../core/cobros-directos';
import { fechaValida, importeValido } from '../../core/cuentas';
import { FechaArgentinaInput } from './fecha-argentina-input';
import { CambiosPendientes } from '../../core/services/cambios-pendientes';
@Component({
  selector: 'app-cobro-directo-form',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    FechaArgentinaInput,
  ],
  templateUrl: './cobro-directo-form.html',
})
export class CobroDirectoForm {
  readonly data = inject<{ cobro?: CobroDirecto; lectura?: boolean }>(MAT_DIALOG_DATA);
  readonly service = inject(CuentasService);
  readonly ref = inject(MatDialogRef<CobroDirectoForm>);
  readonly enviando = signal(false);
  readonly error = signal('');
  private readonly id = this.data.cobro?.id ?? crypto.randomUUID();
  private readonly version = this.service.versionCobro(this.id);
  readonly form = inject(FormBuilder).nonNullable.group({
    alumnoId: [this.data.cobro?.alumnoId ?? '', Validators.required],
    concepto: [
      this.data.cobro?.concepto ?? '',
      [Validators.required, Validators.pattern(/\S/), Validators.maxLength(150)],
    ],
    importe: [
      this.data.cobro?.importe ?? (null as number | null),
      (c: AbstractControl) => (importeValido(c.value) ? null : { importe: true }),
    ],
    fecha: [
      this.data.cobro?.fecha ?? this.service.hoy(),
      (c: AbstractControl) =>
        fechaValida(c.value) && c.value <= this.service.hoy() ? null : { fecha: true },
    ],
    medio: [this.data.cobro?.medio ?? 'Transferencia', Validators.required],
    observaciones: [this.data.cobro?.observaciones ?? '', Validators.maxLength(3000)],
  });
  constructor() {
    if (this.data.lectura) this.form.disable();
    inject(CambiosPendientes).proteger(
      this.ref,
      () => this.form.getRawValue(),
      () => this.enviando(),
      inject(DestroyRef),
    );
  }
  async guardar(): Promise<void> {
    if (this.enviando() || this.data.lectura || !this.service.disponible()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.enviando.set(true);
    const disableClose = this.ref.disableClose;
    this.ref.disableClose = true;
    try {
      const v = this.form.getRawValue();
      if (
        await this.service.guardarCobro(
          { ...v, id: this.id, importe: v.importe! },
          !this.data.cobro,
          this.version,
        )
      )
        this.ref.close(true);
      else this.error.set(this.service.error());
    } finally {
      this.enviando.set(false);
      this.ref.disableClose = disableClose;
    }
  }
}
