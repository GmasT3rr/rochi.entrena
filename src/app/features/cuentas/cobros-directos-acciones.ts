import { inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { CobroDirecto } from '../../core/cobros-directos';
import { CuentasService } from '../../core/services/cuentas-service';
import { CobroDirectoForm } from './cobro-directo-form';
import { ConfirmarAlumno } from '../alumnos/confirmar-alumno';

/** Acciones compartidas por el listado de movimientos y la ficha del alumno. */
@Injectable({ providedIn: 'root' })
export class CobrosDirectosAcciones {
  private readonly service = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  readonly confirmando = signal(false);

  abrir(cobro?: CobroDirecto, lectura = false): void {
    if (
      !this.service.disponible() ||
      this.dialog.openDialogs.some((d) => d.componentInstance instanceof CobroDirectoForm)
    )
      return;
    this.dialog.open(CobroDirectoForm, {
      data: { cobro, lectura },
      closeOnNavigation: false,
      width: '680px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }

  async eliminar(cobro: CobroDirecto): Promise<void> {
    if (this.confirmando() || !this.service.disponible()) return;
    const version = this.service.versionCobro(cobro.id);
    const alumno = this.service.alumnos().find((a) => a.id === cobro.alumnoId);
    this.confirmando.set(true);
    try {
      const ok = await firstValueFrom(
        this.dialog
          .open(ConfirmarAlumno, {
            data: {
              titulo: 'Eliminar cobro directo',
              mensaje: `¿Confirmás eliminar ${cobro.concepto} de ${alumno?.nombre ?? ''} ${alumno?.apellido ?? ''} por ARS ${cobro.importe}? Se descontará de ingresos y quedará en auditoría.`,
              danger: true,
            },
            width: '440px',
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: '90dvh',
          })
          .afterClosed(),
      );
      if (ok) await this.service.eliminarCobro(cobro.id, version);
    } finally {
      this.confirmando.set(false);
    }
  }
}
