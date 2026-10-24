import { PeriodSelector } from '../../shared/period-selector';
import { ToastService } from '../../core/services/toast-service';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { periodoValido } from '../../core/cuentas';
import { ResultadoMensual, VistaMensualRemota } from '../../core/mensual';
import { AuthService } from '../../core/auth/auth-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { errorFinanciero } from '../../core/services/cuentas-remotas-service';

@Component({
  selector: 'app-generar-mensual',
  imports: [
    PeriodSelector,
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
  ],
  templateUrl: './generar-mensual.html',
  styleUrl: './generar-mensual.scss',
})
export class GenerarMensual {
  private readonly toast = inject(ToastService);
  readonly service = inject(CuentasService);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(MatDialogRef<GenerarMensual>);
  readonly periodo = new FormControl(this.service.hoy().slice(0, 7), { nonNullable: true });
  readonly vista = signal<VistaMensualRemota | null>(null);
  readonly resultado = signal<ResultadoMensual | null>(null);
  readonly error = signal('');
  readonly cargando = signal(false);
  readonly generando = signal(false);
  readonly confirmado = signal(false);
  private token = this.auth.session()?.access_token;

  constructor() {
    this.periodo.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.vista.set(null);
      this.resultado.set(null);
      this.confirmado.set(false);
      this.error.set('');
    });
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (token !== this.token) {
        this.token = token;
        untracked(() => {
          this.vista.set(null);
          this.resultado.set(null);
          this.confirmado.set(false);
        });
      }
    });
  }
  async previsualizar(): Promise<void> {
    if (this.cargando() || this.generando() || this.service.guardando() || this.service.cargando())
      return;
    this.vista.set(null);
    this.resultado.set(null);
    this.error.set('');
    this.confirmado.set(false);
    if (!periodoValido(this.periodo.value)) {
      this.error.set('Seleccioná un mes y año válidos (1900 a 9999).');
      this.toast.mostrar(this.error(), 'advertencia');
      return;
    }
    const periodo = this.periodo.value;
    const token = this.auth.session()?.access_token;
    this.cargando.set(true);
    try {
      if (!this.service.disponible()) {
        await this.service.recargar();
        if (!this.service.disponible()) {
          this.error.set(this.service.error());
          return;
        }
      }
      const vista = await this.service.previsualizarMensual(periodo);
      if (periodo === this.periodo.value && token === this.auth.session()?.access_token)
        this.vista.set(vista);
    } catch (error) {
      this.error.set(errorFinanciero(error));
      this.toast.mostrar(this.error(), 'error');
    } finally {
      this.cargando.set(false);
    }
  }
  async generar(): Promise<void> {
    const vista = this.vista();
    if (
      !vista ||
      vista.periodo !== this.periodo.value ||
      !vista.cuotas.length ||
      !this.confirmado() ||
      this.generando() ||
      this.cargando() ||
      !this.service.disponible()
    )
      return;
    this.generando.set(true);
    this.error.set('');
    this.resultado.set(null);
    const disableClose = this.ref.disableClose;
    const token = this.auth.session()?.access_token;
    this.ref.disableClose = true;
    try {
      const resultado = await this.service.generarMensual(vista);
      if (token !== this.auth.session()?.access_token) return;
      this.resultado.set(resultado);
      if (this.service.error()) this.error.set(this.service.error());
      else if (!resultado)
        this.error.set(
          'No se recibió un resultado confirmado. Actualizá la vista previa antes de reintentar.',
        );
    } finally {
      this.vista.set(null);
      this.confirmado.set(false);
      this.generando.set(false);
      this.ref.disableClose = disableClose;
    }
  }
}
