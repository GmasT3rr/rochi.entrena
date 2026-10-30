import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AlumnosService } from '../../core/services/alumnos-service';
import { ToastService } from '../../core/services/toast-service';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import {
  AgendaRepository,
  DatosTurno,
  Turno,
  duracionHorario,
  fechasMes,
  minutos,
  superpone,
} from './agenda';
import { horaTexto } from './agenda-layout';

export interface EntrenamientoDialogData {
  fecha: string;
  inicio: string;
  turno?: Turno;
  detalles?: boolean;
}
export interface EntrenamientoDialogResult {
  fecha?: string;
  alumnoId?: string;
}

@Component({
  selector: 'app-entrenamiento-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    LoadingLayout,
  ],
  templateUrl: './entrenamiento-dialog.html',
  styleUrl: './entrenamiento-dialog.scss',
})
export class EntrenamientoDialog {
  readonly data = inject<EntrenamientoDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject<MatDialogRef<EntrenamientoDialog, EntrenamientoDialogResult>>(MatDialogRef);
  readonly alumnos = inject(AlumnosService);
  private readonly agenda = inject(AgendaRepository);
  private readonly toast = inject(ToastService);
  readonly modo = signal(this.data.detalles ? 'detalles' : 'formulario');
  readonly error = signal('');
  readonly confirmarCancelacion = signal(false);
  readonly mes = this.data.fecha.slice(0, 7);
  readonly ultimaFecha = fechasMes(this.mes).at(-1)!;
  readonly dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  borrador: DatosTurno = this.data.turno
    ? { ...this.data.turno, alumnoIds: [...this.data.turno.alumnoIds] }
    : {
        titulo: '',
        fecha: this.data.fecha,
        inicio: this.data.inicio,
        duracion: Math.min(60, 1440 - minutos(this.data.inicio)),
        modalidad: 'Presencial',
        alumnoIds: [],
        observaciones: '',
      };
  finalizacion = horaTexto((minutos(this.borrador.inicio) + this.borrador.duracion) % 1440);
  repeticion: number[] = [];
  aceptarSuperposicion = false;
  readonly completado = signal(false);
  readonly ocupado = signal(false);
  nombre(id: string): string {
    const alumno = this.alumnos.alumnos().find((a) => a.id === id);
    return alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Alumno no disponible';
  }
  fin(): string {
    return horaTexto(minutos(this.borrador.inicio) + this.borrador.duracion);
  }
  editar(): void {
    this.confirmarCancelacion.set(false);
    this.error.set('');
    this.modo.set('formulario');
  }
  ficha(id: string): void {
    this.ref.close({ alumnoId: id });
  }
  async guardar(form: NgForm): Promise<void> {
    if (this.completado() || this.ocupado()) return;
    this.error.set('');
    const duracion = duracionHorario(this.borrador.inicio, this.finalizacion);
    if (this.agenda.errorListado()) {
      this.error.set(this.agenda.errorListado());
      return;
    }
    if (this.agenda.cargando()) {
      this.error.set('Esperá a que termine la carga de la agenda.');
      return;
    }
    if (form.invalid || !Number.isInteger(duracion) || duracion <= 0) {
      form.control.markAllAsTouched();
      this.error.set(
        'Completá fecha, horarios y alumnos. La finalización debe ser posterior al inicio, dentro del mismo día.',
      );
      return;
    }
    if (this.borrador.fecha.slice(0, 7) !== this.mes) {
      this.error.set('Elegí una fecha dentro del mes seleccionado: ' + this.mes + '.');
      return;
    }
    if (
      this.alumnos.cargando() ||
      this.alumnos.errorListado() ||
      !this.borrador.alumnoIds.length ||
      this.borrador.alumnoIds.some((id) => !this.alumnos.alumnos().some((a) => a.id === id))
    ) {
      this.error.set('Seleccioná al menos un alumno del listado disponible.');
      return;
    }
    this.ocupado.set(true);
    this.ref.disableClose = true;
    try {
      const cantidad = await this.agenda.guardar(
        { ...this.borrador, duracion, titulo: this.borrador.titulo?.trim() },
        this.repeticion,
        this.data.turno?.id,
        this.aceptarSuperposicion,
        this.data.turno?.version,
      );
      this.completado.set(true);
      this.toast.mostrar(`${cantidad} entrenamiento(s) guardado(s) en Supabase.`, 'exito');
      this.ref.close({ fecha: this.borrador.fecha });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.ocupado.set(false);
      this.ref.disableClose = false;
    }
  }
  /** Advertencia inmediata; el repositorio valida también el lote de repeticiones al guardar. */
  superposiciones(): readonly Turno[] {
    const datos = {
      ...this.borrador,
      duracion: duracionHorario(this.borrador.inicio, this.finalizacion),
    };
    return this.agenda
      .listar()
      .filter(
        (t) => t.estado === 'programado' && t.id !== this.data.turno?.id && superpone(t, datos),
      );
  }
  async cancelarTurno(): Promise<void> {
    if (!this.confirmarCancelacion() || !this.data.turno || this.completado() || this.ocupado())
      return;
    this.ocupado.set(true);
    this.ref.disableClose = true;
    this.error.set('');
    try {
      await this.agenda.cancelar(this.data.turno.id, this.data.turno.version);
      this.completado.set(true);
      this.toast.mostrar('Entrenamiento cancelado en Supabase.', 'exito');
      this.ref.close({ fecha: this.borrador.fecha });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.ocupado.set(false);
      this.ref.disableClose = false;
    }
  }
}
