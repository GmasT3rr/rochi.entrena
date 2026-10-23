import { Component, inject, Injectable } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBar, MatSnackBarRef } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
export type TipoToast = 'exito' | 'error' | 'advertencia' | 'informacion';
@Component({
  selector: 'app-toast',
  imports: [MatIconModule, MatButtonModule],
  template: `<div class="hub-toast">
    <mat-icon aria-hidden="true">{{ data.icono }}</mat-icon
    ><span>{{ data.mensaje }}</span
    ><button mat-icon-button aria-label="Cerrar notificación" (click)="ref.dismiss()">
      <mat-icon>close</mat-icon>
    </button>
  </div>`,
})
export class Toast {
  readonly data = inject<{ mensaje: string; icono: string }>(MAT_SNACK_BAR_DATA);
  readonly ref = inject(MatSnackBarRef);
}
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snack = inject(MatSnackBar);
  private ultimo = '';
  private instante = 0;
  mostrar(mensaje: string, tipo: TipoToast = 'informacion'): void {
    if (!mensaje.trim()) return;
    const clave = tipo + mensaje;
    if (clave === this.ultimo && Date.now() - this.instante < 2500) return;
    this.ultimo = clave;
    this.instante = Date.now();
    this.snack.openFromComponent(Toast, {
      data: {
        mensaje,
        icono: {
          exito: 'check_circle',
          error: 'error',
          advertencia: 'warning',
          informacion: 'info',
        }[tipo],
      },
      duration: tipo === 'error' ? 9000 : tipo === 'advertencia' ? 7000 : 5000,
      panelClass: ['hub-toast-panel', 'hub-toast--' + tipo],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      announcementMessage: mensaje,
      politeness: tipo === 'error' ? 'assertive' : 'polite',
    });
  }
}
