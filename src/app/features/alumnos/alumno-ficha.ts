import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { AlumnosService } from '../../core/services/alumnos-service';

@Component({
  selector: 'app-alumno-ficha',
  imports: [DatePipe, MatDialogModule, MatButtonModule],
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
          @if (a.proximaCuota) {
            <dt>Próxima cuota</dt>
            <dd>{{ a.proximaCuota | date: 'dd/MM/yyyy' }}</dd>
          }
          <dt>Observaciones</dt>
          <dd>{{ a.observaciones || 'Sin observaciones' }}</dd>
        </dl>
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
  private readonly id = inject<string>(MAT_DIALOG_DATA);
  private readonly service = inject(AlumnosService);
  readonly alumno = computed(() => this.service.alumnos().find((a) => a.id === this.id));
}
