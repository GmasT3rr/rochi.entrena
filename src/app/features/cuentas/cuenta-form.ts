import { PeriodSelector } from '../../shared/period-selector';
import { DestroyRef } from '@angular/core';
import { CambiosPendientes } from '../../core/services/cambios-pendientes';
import { ToastService } from '../../core/services/toast-service';
import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { HistorialPagos } from './historial-pagos';
import { StatCard } from '../../shared/stat-card/stat-card';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { confirmarEliminarCuota } from './confirmar-eliminar-cuota';
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
import { CuentasService } from '../../core/services/cuentas-service';
import { FechaArgentinaInput } from './fecha-argentina-input';
import { ConfirmarAlumno } from '../alumnos/confirmar-alumno';

export type CuentaFormData =
  | { tipo: 'cuota'; cuota?: Cuota; alumnoId?: string }
  | { tipo: 'pago'; cuota: Cuota; pago?: PagoCuota };
const dinero = (c: AbstractControl) => (importeValido(c.value) ? null : { importe: true });
const fecha = (c: AbstractControl) => (fechaValida(c.value) ? null : { fecha: true });
const periodo = (c: AbstractControl) => (periodoValido(c.value) ? null : { periodo: true });
@Component({
  selector: 'app-cuenta-form',
  imports: [
    HistorialPagos,
    StatCard,
    LoadingLayout,
    PeriodSelector,
    CurrencyPipe,
    FechaArgentinaInput,
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
  private readonly toast = inject(ToastService);
  readonly service = inject(CuentasService);
  readonly alumnos = this.service;
  private readonly ref = inject(MatDialogRef<CuentaForm>);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  readonly error = signal('');
  readonly confirmando = signal(false);
  readonly enviando = signal(false);
  readonly cuenta = () => this.service.cuentas().find((c) => c.id === this.data.cuota?.id);
  private ultimoMedio(): PagoCuota['medio'] {
    const ultimo = [...this.service.cuentas().flatMap((c) => c.pagos ?? [])].sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id),
    )[0];
    return ultimo && ['Efectivo', 'Transferencia', 'Otro'].includes(ultimo.medio)
      ? ultimo.medio
      : 'Transferencia';
  }
  readonly pago = this.data.tipo === 'pago' ? this.data.pago : undefined;
  private readonly nuevoId = crypto.randomUUID();
  private versionInicial = this.pago
    ? this.service.versionPago(this.pago.id)
    : this.data.tipo === 'cuota' && this.data.cuota
      ? this.service.versionCuota(this.data.cuota.id)
      : undefined;
  readonly cuotaForm = this.fb.nonNullable.group({
    alumnoId: [
      this.data.cuota?.alumnoId ??
        (this.data.tipo === 'cuota' ? this.data.alumnoId : undefined) ??
        '',
      Validators.required,
    ],
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
    importe: [this.pago?.importe ?? this.disponible, [Validators.required, dinero]],
    fecha: [this.pago?.fecha ?? this.service.hoy(), fecha],
    medio: [this.pago?.medio ?? this.ultimoMedio(), Validators.required],
    observaciones: [this.pago?.observaciones ?? '', Validators.maxLength(3000)],
  });
  private readonly valoresCuota = toSignal(this.cuotaForm.valueChanges, {
    initialValue: this.cuotaForm.getRawValue(),
  });
  private readonly originalCuota = signal(JSON.stringify(this.cuotaForm.getRawValue()));
  readonly cambiosCuota = computed(() => {
    this.valoresCuota();
    return JSON.stringify(this.cuotaForm.getRawValue()) !== this.originalCuota();
  });
  readonly gestionandoPago = signal(false);
  readonly desactualizada = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  sincronizarCuota(): void {
    const c = this.cuenta();
    if (this.data.tipo !== 'cuota' || !c) return;
    if (this.cambiosCuota()) {
      const version = this.service.versionCuota(c.id);
      this.desactualizada.set(JSON.stringify(version) !== JSON.stringify(this.versionInicial));
      return;
    }
    this.cuotaForm.patchValue({
      alumnoId: c.alumnoId,
      concepto: c.concepto,
      periodo: c.periodo,
      importe: c.importe,
      vencimiento: c.vencimiento,
      observaciones: c.observaciones,
    });
    this.originalCuota.set(JSON.stringify(this.cuotaForm.getRawValue()));
    this.versionInicial = this.service.versionCuota(c.id);
    this.desactualizada.set(false);
  }
  gestionarPago(pago?: PagoCuota): void {
    const cuota = this.cuenta();
    if (
      !cuota ||
      !this.service.disponible() ||
      this.cambiosCuota() ||
      this.gestionandoPago() ||
      this.confirmando() ||
      this.enviando()
    )
      return;
    if (!pago && cuota.saldo <= 0) return;
    this.gestionandoPago.set(true);
    this.dialog
      .open(CuentaForm, {
        closeOnNavigation: false,
        data: { tipo: 'pago', cuota, pago },
        width: '600px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      })
      .afterClosed()
      .subscribe(() => {
        if (this.destroyRef.destroyed) return;
        this.gestionandoPago.set(false);
        this.sincronizarCuota();
      });
  }
  async eliminarPago(pago: PagoCuota): Promise<void> {
    if (
      !this.service.disponible() ||
      this.cambiosCuota() ||
      this.gestionandoPago() ||
      this.confirmando() ||
      this.enviando()
    )
      return;
    const version = this.service.versionPago(pago.id);
    this.confirmando.set(true);
    try {
      const ok = await firstValueFrom(
        this.dialog
          .open(ConfirmarAlumno, {
            width: '420px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '90dvh',
            data: {
              titulo: 'Eliminar pago',
              danger: true,
              mensaje: '¿Confirmás eliminar este pago? El saldo y los ingresos se recalcularán.',
            },
          })
          .afterClosed(),
      );
      if (ok) await this.service.eliminarPago(pago.id, version);
      this.sincronizarCuota();
    } finally {
      this.confirmando.set(false);
    }
  }
  async eliminarCuota(): Promise<void> {
    const c = this.cuenta();
    if (
      !c ||
      c.pagos.length ||
      !this.service.disponible() ||
      this.cambiosCuota() ||
      this.confirmando() ||
      this.gestionandoPago()
    )
      return;
    this.confirmando.set(true);
    try {
      if (await confirmarEliminarCuota(this.dialog, this.service, c)) this.ref.close(true);
    } finally {
      this.confirmando.set(false);
    }
  }
  readonly titulo =
    this.data.tipo === 'cuota'
      ? this.data.cuota
        ? 'Editar cuota'
        : 'Nueva cuota'
      : this.pago
        ? 'Editar pago'
        : 'Registrar cobro';
  get saldoResultante(): number | null {
    const importe = this.pagoForm.controls.importe.value;
    return importeValido(importe) ? (centavos(this.disponible) - centavos(importe)) / 100 : null;
  }
  get disponible(): number {
    const cuenta = this.service.cuentas().find((c) => c.id === this.data.cuota?.id);
    return ((cuenta ? centavos(cuenta.saldo) : 0) + centavos(this.pago?.importe ?? 0)) / 100;
  }
  constructor() {
    inject(CambiosPendientes).proteger(
      this.ref,
      () =>
        this.data.tipo === 'cuota'
          ? this.cambiosCuota()
            ? this.cuotaForm.getRawValue()
            : null
          : this.pagoForm.getRawValue(),
      () =>
        this.service.guardando() || this.confirmando() || this.enviando() || this.gestionandoPago(),
      inject(DestroyRef),
    );
    if (this.data.tipo === 'cuota' && this.data.cuota) this.cuotaForm.controls.alumnoId.disable();
    if (this.data.tipo === 'cuota' && this.data.cuota) {
      effect(() => {
        this.cuenta();
        untracked(() => this.sincronizarCuota());
      });
      if (!this.service.cargando()) void this.service.recargar();
    }
  }
  async guardar(): Promise<void> {
    if (this.enviando() || this.confirmando() || this.gestionandoPago() || this.service.guardando())
      return;
    this.error.set('');
    const form = this.data.tipo === 'cuota' ? this.cuotaForm : this.pagoForm;
    form.markAllAsTouched();

    if (form.invalid)
      this.toast.mostrar('Revisá los campos marcados antes de guardar.', 'advertencia');
    if (form.invalid || this.confirmando() || !this.service.disponible()) return;
    if (
      this.data.tipo === 'pago' &&
      (!this.cuenta() || this.disponible <= 0 || this.saldoResultante! < 0)
    ) {
      this.error.set(
        this.disponible <= 0
          ? 'Esta cuota ya está pagada.'
          : 'El importe supera el saldo disponible.',
      );
      return;
    }
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
    } else await this.persistir();
  }
  private async persistir(): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(true);
    const anteriorDisableClose = this.ref.disableClose;
    this.ref.disableClose = true;
    try {
      let ok: boolean;
      if (this.data.tipo === 'cuota') {
        const values = this.cuotaForm.getRawValue();
        ok = await this.service.guardarCuota(
          { ...values, importe: values.importe! },
          this.data.cuota?.id,
          this.nuevoId,
          this.versionInicial,
        );
      } else {
        const values = this.pagoForm.getRawValue();
        ok = await this.service.guardarPago(
          { ...values, importe: values.importe!, cuotaId: this.data.cuota.id },
          this.pago?.id,
          this.nuevoId,
          this.versionInicial,
        );
      }
      if (ok) this.ref.close(true);
      else this.error.set(this.service.error());
    } catch {
      this.error.set('No se pudo confirmar el guardado. Actualizá los datos antes de reintentar.');
    } finally {
      this.enviando.set(false);
      this.ref.disableClose = anteriorDisableClose;
    }
  }
}
