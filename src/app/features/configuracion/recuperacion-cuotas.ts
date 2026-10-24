import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { CuentasService } from '../../core/services/cuentas-service';
import { GenerarMensual } from '../cuentas/generar-mensual';

@Component({
  selector: 'app-recuperacion-cuotas',
  imports: [MatButtonModule],
  template: `
    <p>
      Usá esta herramienta solo si faltan cuotas. Revisá el período, los importes actuales y los
      alumnos omitidos antes de confirmar.
    </p>
    <p>
      Para meses anteriores, verificá los importes y estados que correspondían: la aplicación no
      reconstruye configuraciones históricas.
    </p>
    <button mat-stroked-button (click)="abrir()" [disabled]="!cuentas.disponible()">
      Revisar cuotas faltantes
    </button>
    @if (cuentas.errorCarga()) {
      <p role="alert">No se pudieron consultar los datos.</p>
      <button mat-button (click)="cuentas.recargar()" [disabled]="cuentas.cargando()">
        Actualizar datos
      </button>
    }
  `,
})
export class RecuperacionCuotas {
  readonly cuentas = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  constructor() {
    this.cuentas.refrescarSiNecesario();
  }
  abrir(): void {
    if (
      !this.cuentas.disponible() ||
      this.dialog.openDialogs.some((d) => d.componentInstance instanceof GenerarMensual)
    )
      return;
    this.dialog.open(GenerarMensual, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
}
