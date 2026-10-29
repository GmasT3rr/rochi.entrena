import { inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AlumnoRegistro } from '../../core/alumno';
import { AlumnosService } from '../../core/services/alumnos-service';
import { ToastService } from '../../core/services/toast-service';
import { ConfirmarAlumno } from './confirmar-alumno';
@Injectable({ providedIn: 'root' })
export class AlumnoEstadoAcciones {
  private readonly service = inject(AlumnosService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  readonly cambiandoEstado = signal(false);
  readonly errorEstado = signal('');
  async cambiar(alumno: AlumnoRegistro): Promise<void> {
    if (this.cambiandoEstado() || this.service.guardando() || this.service.cargando()) return;
    const baja = alumno.estado !== 'Inactivo';
    this.errorEstado.set('');
    this.cambiandoEstado.set(true);
    try {
      const confirmado = await firstValueFrom(
        this.dialog
          .open(ConfirmarAlumno, {
            width: '420px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '90dvh',
            data: {
              titulo: baja ? 'Dar de baja' : 'Reactivar alumno',
              danger: baja,
              mensaje: `¿Confirmás ${baja ? 'dar de baja a' : 'reactivar a'} ${alumno.nombre} ${alumno.apellido}? ${baja ? 'Su información se conservará.' : 'Quedará activo nuevamente.'}`,
            },
          })
          .afterClosed(),
      );
      if (
        confirmado &&
        !(await this.service.cambiarEstado(alumno.id, baja ? 'Inactivo' : 'Activo'))
      )
        this.errorEstado.set(this.service.error() || 'No se pudo cambiar el estado. Reintentá.');
    } catch {
      this.errorEstado.set('No se pudo cambiar el estado. Reintentá.');
      this.toast.mostrar(this.errorEstado(), 'error');
    } finally {
      this.cambiandoEstado.set(false);
    }
  }
}
