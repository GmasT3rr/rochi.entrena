import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuotaDetalle } from '../cuentas/cuota-detalle';
import { AlumnosService } from '../../core/services/alumnos-service';

@Component({
  selector: 'app-alumno-ficha',
  imports: [CurrencyPipe, DatePipe, MatDialogModule, MatButtonModule],
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
      @if (alumno(); as a) {
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
          @if (cuentas.proximaCuota(a.id); as fecha) {
            <dt>Próxima cuota</dt>
            <dd>{{ fecha | date: 'dd/MM/yyyy' }}</dd>
          }
          <dt>Observaciones</dt>
          <dd>{{ a.observaciones || 'Sin observaciones' }}</dd>
        </dl>
        <h3>Cuotas y pagos</h3>
        <p>
          Saldo total pendiente:
          <strong>{{ cuentas.saldoAlumno(a.id) | currency: 'ARS' : 'symbol' : '1.2-2' }}</strong>
        </p>
        @for (c of cuentas.cuotasAlumno(a.id); track c.id) {
          <div class="student-account">
            <strong>{{ c.concepto }} · {{ c.periodo + '-01' | date: 'MMMM yyyy' }}</strong>
            <p>{{ c.estado }} · Saldo: {{ c.saldo | currency: 'ARS' : 'symbol' : '1.2-2' }}</p>
            <button mat-button (click)="detalle(c.id)">Ver cuota e historial de pagos</button>
          </div>
        } @empty {
          <p>Sin cuotas.</p>
        }
        @if (cuentas.error()) {
          <p role="alert">{{ cuentas.error() }}</p>
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
  readonly cuentas = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  detalle(id: string): void {
    this.dialog.open(CuotaDetalle, {
      data: id,
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  private readonly id = inject<string>(MAT_DIALOG_DATA);
  private readonly service = inject(AlumnosService);
  readonly alumno = computed(() => this.service.alumnos().find((a) => a.id === this.id));
}
