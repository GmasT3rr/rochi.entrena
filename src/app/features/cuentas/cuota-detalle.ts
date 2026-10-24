import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ordenar } from '../../core/services/orden-tabla';
import { Sort } from '@angular/material/sort';
import { normalizarConcepto } from '../../core/cuentas';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
import { MatIconModule } from '@angular/material/icon';
import { confirmarEliminarCuota } from './confirmar-eliminar-cuota';
import { ConfirmarAlumno } from '../alumnos/confirmar-alumno';

@Component({
  selector: 'app-cuota-detalle',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    LoadingLayout,
    CurrencyPipe,
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './cuota-detalle.html',
  styleUrl: './cuota-detalle.scss',
})
export class CuotaDetalle {
  private readonly id = inject<string>(MAT_DIALOG_DATA);
  readonly service = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<CuotaDetalle>);
  readonly cuenta = computed(() => this.service.cuentas().find((c) => c.id === this.id));
  readonly ordenPagos = signal<Sort>({ active: 'fecha', direction: 'desc' });
  readonly busquedaPagos = signal('');
  readonly pagosVisibles = computed(() =>
    ordenar(
      (this.cuenta()?.pagos ?? []).filter((p) =>
        normalizarConcepto(p.medio + ' ' + p.observaciones + ' ' + p.fecha).includes(
          normalizarConcepto(this.busquedaPagos()),
        ),
      ),
      this.ordenPagos(),
      (p, k) => p[k as 'fecha' | 'importe' | 'medio'],
    ),
  );
  ordenarPagos(valor: string): void {
    const [active, direction] = valor.split(':');
    this.ordenPagos.set({ active, direction: direction as 'asc' | 'desc' });
  }
  readonly confirmando = signal(false);

  editar(): void {
    if (!this.service.disponible()) return;
    const cuota = this.cuenta();
    if (!cuota) return;
    this.dialog.open(CuentaForm, {
      closeOnNavigation: false,
      data: { tipo: 'cuota', cuota },
      width: '680px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  pago(pago?: PagoCuota): void {
    if (!this.service.disponible()) return;
    const cuota = this.cuenta();
    if (!cuota) return;
    this.dialog.open(CuentaForm, {
      closeOnNavigation: false,
      data: { tipo: 'pago', cuota, pago },
      width: '600px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  async eliminar(pago?: PagoCuota): Promise<void> {
    if (!pago) {
      const cuota = this.cuenta();
      if (!cuota || this.confirmando() || cuota.pagos.length || !this.service.disponible()) return;
      this.confirmando.set(true);
      try {
        if (await confirmarEliminarCuota(this.dialog, this.service, cuota)) this.ref.close();
      } finally {
        this.confirmando.set(false);
      }
      return;
    }
    if (!this.service.disponible() || this.confirmando()) return;
    const version = pago ? this.service.versionPago(pago.id) : this.service.versionCuota(this.id);
    this.confirmando.set(true);
    this.dialog
      .open(ConfirmarAlumno, {
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        data: {
          titulo: pago ? 'Eliminar pago' : 'Eliminar cuota',
          danger: true,
          mensaje: pago
            ? '¿Confirmás eliminar este pago? El saldo y los ingresos se recalcularán.'
            : '¿Confirmás eliminar esta cuota sin pagos? Esta acción no se puede deshacer.',
        },
      })
      .afterClosed()
      .subscribe(async (ok) => {
        try {
          if (!ok) return;
          if (pago) await this.service.eliminarPago(pago.id, version);
          else if (await this.service.eliminarCuota(this.id, version)) this.ref.close();
        } finally {
          this.confirmando.set(false);
        }
      });
  }
}
