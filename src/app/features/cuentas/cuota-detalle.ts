import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { CuentasService } from '../../core/services/cuentas-service';
import { PagoCuota } from '../../core/cuentas';
import { CuentaForm } from './cuenta-form';
import { ConfirmarAlumno } from '../alumnos/confirmar-alumno';

@Component({
  selector: 'app-cuota-detalle',
  imports: [CurrencyPipe, DatePipe, MatDialogModule, MatButtonModule],
  templateUrl: './cuota-detalle.html',
  styleUrl: './cuota-detalle.scss',
})
export class CuotaDetalle {
  private readonly id = inject<string>(MAT_DIALOG_DATA);
  readonly service = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<CuotaDetalle>);
  readonly cuenta = computed(() => this.service.cuentas().find((c) => c.id === this.id));
  editar(): void {
    const cuota = this.cuenta();
    if (!cuota) return;
    this.dialog.open(CuentaForm, {
      data: { tipo: 'cuota', cuota },
      width: '680px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  pago(pago?: PagoCuota): void {
    const cuota = this.cuenta();
    if (!cuota) return;
    this.dialog.open(CuentaForm, {
      data: { tipo: 'pago', cuota, pago },
      width: '600px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  eliminar(pago?: PagoCuota): void {
    this.dialog
      .open(ConfirmarAlumno, {
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        data: {
          titulo: pago ? 'Eliminar pago' : 'Eliminar cuota',
          mensaje: pago
            ? '¿Confirmás eliminar este pago? El saldo y los ingresos se recalcularán.'
            : '¿Confirmás eliminar esta cuota sin pagos? Esta acción no se puede deshacer.',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        if (pago) this.service.eliminarPago(pago.id);
        else if (this.service.eliminarCuota(this.id)) this.ref.close();
      });
  }
}
