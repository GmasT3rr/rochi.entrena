import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { CobrosDirectos } from '../cuentas/cobros-directos';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuotaDetalle } from '../cuentas/cuota-detalle';

@Component({
  selector: 'app-alumno-ficha',
  imports: [
    LoadingLayout,
    CobrosDirectos,
    CurrencyPipe,
    DatePipe,
    MatDialogModule,
    MatButtonModule,
  ],
  styles: `
    dl {
      margin: 0;
    }
    dt {
      color: var(--hub-muted);
      margin-top: 1rem;
    }
    dd {
      margin: 0.25rem 0 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <h2 mat-dialog-title>Ficha del alumno</h2>
    <mat-dialog-content>
      @if (service.cargandoInicial()) {
        <app-loading-layout variant="ficha" label="Cargando alumno" />
      } @else if (service.errorListado()) {
        <p role="alert">{{ service.errorListado() }}</p>
        <button mat-stroked-button (click)="service.recargar()">Reintentar</button>
      } @else if (alumno(); as a) {
        <dl>
          <dt>Nombre y apellido</dt>
          <dd>{{ a.nombre }} {{ a.apellido }}</dd>
          <dt>Teléfono</dt>
          <dd>{{ a.telefono || 'Sin registrar' }}</dd>
          <dt>Email</dt>
          <dd>{{ a.email || 'Sin registrar' }}</dd>
          <dt>Modalidad</dt>
          <dd>{{ a.modalidad }}</dd>
          <dt>Estado</dt>
          <dd>{{ a.estado }}</dd>
          <dt>Fecha de ingreso</dt>
          <dd>{{ a.fechaIngreso | date: 'dd/MM/yyyy' }}</dd>
          <dt>Observaciones</dt>
          <dd>{{ a.observaciones || 'Sin observaciones' }}</dd>
        </dl>
        <h3>Configuración de cobro</h3>
        <p>
          Cuota mensual: {{ a.configuracionMensual?.habilitada ? 'Habilitada' : 'Deshabilitada' }}
        </p>
        @if (a.configuracionMensual) {
          <dl>
            <dt>Importe mensual</dt>
            <dd>{{ a.configuracionMensual!.importe | currency: 'ARS' : 'symbol' : '1.2-2' }}</dd>
            <dt>Día de vencimiento</dt>
            <dd>{{ a.configuracionMensual!.diaVencimiento }} (o el último día del mes)</dd>
          </dl>
        }
        <p>Podés modificar esta configuración desde Editar alumno.</p>
        <h3>Cuotas y pagos</h3>
        <button mat-stroked-button (click)="verCuentas(a.id)">
          Ver todas las cuotas del alumno
        </button>
        <button
          mat-button
          (click)="cuentas.recargar()"
          [disabled]="cuentas.cargando() || cuentas.guardando()"
        >
          Actualizar cuentas
        </button>
        @if (cuentas.cargando() && cuentas.tieneDatos()) {
          <p role="status">Actualizando cuotas y pagos…</p>
        }
        @if (cuentas.cargandoInicial()) {
          <app-loading-layout variant="pagos" label="Cargando cuotas y pagos" />
        } @else if (cuentas.errorCarga()) {
          <p role="alert">{{ cuentas.error() || cuentas.errorCarga() }}</p>
        } @else if (cuentas.tieneDatos()) {
          <p>
            Saldo pendiente:
            <strong>{{ cuentas.saldoAlumno(a.id) | currency: 'ARS' : 'symbol' : '1.2-2' }}</strong>
          </p>
          @if (cuentas.proximaCuota(a.id); as fecha) {
            <p>Próximo vencimiento: {{ fecha | date: 'dd/MM/yyyy' }}</p>
          }
          <app-cobros-directos [alumno]="a.id" />
          @for (c of cuentas.cuotasAlumno(a.id); track c.id) {
            <p>
              {{ c.concepto }} · {{ c.periodo }} · {{ c.estado }} · Saldo
              {{ c.saldo | currency: 'ARS' : 'symbol' : '1.2-2' }}
            </p>
            <button mat-button (click)="detalle(c.id)">Ver cuota e historial de pagos</button>
          } @empty {
            <p>No hay cuotas registradas para este alumno.</p>
          }
        }
      } @else {
        <p>No se encontró el alumno.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-button mat-dialog-close>Cerrar</button></mat-dialog-actions
    >
  `,
})
export class AlumnoFicha {
  private readonly router = inject(Router);
  private readonly ref = inject(MatDialogRef<AlumnoFicha>);
  async verCuentas(id: string): Promise<void> {
    if (await this.router.navigate(['/cuentas'], { queryParams: { alumno: id } })) this.ref.close();
  }
  readonly cuentas = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  constructor() {
    void this.cuentas.recargar();
  }
  detalle(id: string): void {
    this.dialog.open(CuotaDetalle, {
      data: id,
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  private readonly id = inject<string>(MAT_DIALOG_DATA);
  readonly service = inject(AlumnosService);
  readonly alumno = computed(() => this.service.alumnos().find((a) => a.id === this.id));
}
