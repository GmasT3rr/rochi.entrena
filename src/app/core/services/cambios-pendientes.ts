import { Component, DestroyRef, inject, Injectable } from '@angular/core';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { CanDeactivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
@Component({
  selector: 'app-descartar-cambios',
  imports: [MatDialogModule, MatButtonModule],
  template: `<h2 mat-dialog-title>¿Salir sin guardar?</h2>
    <mat-dialog-content>Tenés cambios pendientes de guardar.</mat-dialog-content
    ><mat-dialog-actions align="end"
      ><button mat-button [mat-dialog-close]="false" cdkFocusInitial>Continuar editando</button
      ><button mat-flat-button [mat-dialog-close]="true">
        Descartar cambios y salir
      </button></mat-dialog-actions
    >`,
})
export class DescartarCambios {}
export const cambioReal = (inicial: unknown, actual: unknown) =>
  JSON.stringify(inicial) !== JSON.stringify(actual);
@Injectable({ providedIn: 'root' })
export class CambiosPendientes {
  private readonly dialog = inject(MatDialog);
  private readonly registros = new Set<{
    pendiente: () => boolean;
    ocupado: () => boolean;
    cerrar: () => void;
  }>();
  private confirmacion?: Promise<boolean>;
  constructor() {
    const avisar = (e: BeforeUnloadEvent) => {
      if ([...this.registros].some((r) => r.pendiente() || r.ocupado())) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', avisar);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', avisar));
  }
  proteger<T>(
    ref: MatDialogRef<T>,
    valor: () => unknown,
    ocupado: () => boolean,
    destroy: DestroyRef,
  ): void {
    const inicial = valor();
    const cerrar = ref.close.bind(ref);
    const registro = {
      pendiente: () => cambioReal(inicial, valor()),
      ocupado,
      cerrar: () => cerrar(),
    };
    this.registros.add(registro);
    ref.disableClose = true;
    ref.close = (resultado?: unknown) => {
      if (resultado === true) {
        this.registros.delete(registro);
        cerrar(resultado);
        return;
      }
      if (ocupado()) return;
      if (!registro.pendiente()) {
        cerrar();
        return;
      }
      void this.confirmar().then((ok) => {
        if (ok && !ocupado()) cerrar();
      });
    };
    ref
      .backdropClick()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe(() => ref.close());
    ref
      .keydownEvents()
      .pipe(takeUntilDestroyed(destroy))
      .subscribe((e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          ref.close();
        }
      });
    destroy.onDestroy(() => this.registros.delete(registro));
  }
  private confirmar(): Promise<boolean> {
    if (!this.confirmacion) {
      this.confirmacion = firstValueFrom(
        this.dialog
          .open(DescartarCambios, {
            width: '440px',
            maxWidth: 'calc(100vw - 24px)',
            disableClose: true,
          })
          .afterClosed(),
      )
        .then(Boolean)
        .finally(() => (this.confirmacion = undefined));
    }
    return this.confirmacion;
  }
  async salir(): Promise<boolean> {
    if ([...this.registros].some((r) => r.ocupado())) return false;
    if ([...this.registros].some((r) => r.pendiente()) && !(await this.confirmar())) return false;
    if ([...this.registros].some((r) => r.ocupado())) return false;
    for (const registro of this.registros) registro.cerrar();
    this.registros.clear();
    return true;
  }
}
export const cambiosGuard: CanDeactivateFn<unknown> = () => inject(CambiosPendientes).salir();
