import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { CuentaVista } from '../../core/cuentas';
import { CuentasService } from '../../core/services/cuentas-service';

@Component({
  imports: [CurrencyPipe, DatePipe, A11yModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Eliminar cuota</h2>
    <mat-dialog-content>
      <p>Vas a eliminar esta cuota sin pagos registrados:</p>
      <dl>
        <dt>Alumno</dt>
        <dd>{{ cuota.alumno }}</dd>
        <dt>Concepto</dt>
        <dd>{{ cuota.concepto }}</dd>
        <dt>Período</dt>
        <dd>{{ cuota.periodo + '-01' | date: 'MMMM yyyy' }}</dd>
        <dt>Importe</dt>
        <dd>{{ cuota.importe | currency: 'ARS' : 'symbol' : '1.2-2' }}</dd>
      </dl>
      <p>Esta acción no se puede deshacer.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false" cdkFocusInitial>Cancelar</button>
      <button mat-flat-button class="destructive" [mat-dialog-close]="true">Eliminar</button>
    </mat-dialog-actions>
  `,
  styles: `
    dl {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.5rem 1rem;
    }
    dt {
      color: var(--hub-muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .destructive {
      --mat-button-filled-container-color: var(--hub-error);
      --mat-button-filled-label-text-color: var(--hub-surface);
    }
  `,
})
export class ConfirmarEliminarCuota {
  readonly cuota = inject<CuentaVista>(MAT_DIALOG_DATA);
}

/** Mantiene la versión vista al confirmar y delega integridad/autorización al servicio existente. */
export async function confirmarEliminarCuota(
  dialog: MatDialog,
  service: CuentasService,
  cuota: CuentaVista,
): Promise<boolean> {
  if (!service.disponible() || cuota.pagos.length) return false;
  const version = service.versionCuota(cuota.id);
  const confirmado = await firstValueFrom(
    dialog
      .open(ConfirmarEliminarCuota, {
        data: cuota,
        width: '440px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      })
      .afterClosed(),
  );
  if (!confirmado) return false;
  return service.eliminarCuota(cuota.id, version);
}
