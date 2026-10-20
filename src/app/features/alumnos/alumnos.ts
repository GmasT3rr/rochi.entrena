import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AlumnoRegistro, EstadoRegistroAlumno, ModalidadAlumno } from '../../core/alumno';
import { AlumnosService } from '../../core/services/alumnos-service';
import { PageHeader } from '../../shared/page-header/page-header';
import { AlumnoForm } from './alumno-form';
import { AlumnoFicha } from './alumno-ficha';
import { ConfirmarAlumno } from './confirmar-alumno';

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

@Component({
  imports: [
    DatePipe,
    MatCard,
    MatCardContent,
    MatTableModule,
    PageHeader,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  selector: 'app-alumnos',
  styleUrl: './alumnos.scss',
  templateUrl: './alumnos.html',
})
export class Alumnos {
  readonly service = inject(AlumnosService);
  private readonly dialog = inject(MatDialog);
  readonly busqueda = signal('');
  readonly modalidad = signal<ModalidadAlumno | ''>('');
  readonly estado = signal<EstadoRegistroAlumno | ''>('');
  readonly mensaje = signal('');
  readonly columnas = ['nombre', 'modalidad', 'estado', 'proximaCuota', 'acciones'];
  readonly alumnos = computed(() => {
    const texto = normalizar(this.busqueda().trim());
    return this.service
      .alumnos()
      .filter(
        (a) =>
          (!this.modalidad() || a.modalidad === this.modalidad()) &&
          (!this.estado() || a.estado === this.estado()) &&
          normalizar(`${a.nombre} ${a.apellido} ${a.email} ${a.telefono}`).includes(texto),
      );
  });

  editar(alumno: AlumnoRegistro | null = null): void {
    this.dialog
      .open(AlumnoForm, {
        data: alumno,
        width: '680px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      })
      .afterClosed()
      .subscribe((guardado) => {
        if (guardado) this.mensaje.set(alumno ? 'Alumno actualizado.' : 'Alumno agregado.');
      });
  }

  ficha(alumno: AlumnoRegistro): void {
    this.dialog.open(AlumnoFicha, {
      data: alumno.id,
      width: '560px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }

  cambiarEstado(alumno: AlumnoRegistro): void {
    const baja = alumno.estado !== 'Inactivo';
    this.dialog
      .open(ConfirmarAlumno, {
        width: '420px',
        maxWidth: 'calc(100vw - 32px)',
        data: {
          titulo: baja ? 'Dar de baja' : 'Reactivar alumno',
          mensaje: `¿Confirmás ${baja ? 'dar de baja a' : 'reactivar a'} ${alumno.nombre} ${alumno.apellido}? ${baja ? 'Su información se conservará.' : 'Quedará activo nuevamente.'}`,
        },
      })
      .afterClosed()
      .subscribe((confirmado) => {
        if (confirmado && this.service.cambiarEstado(alumno.id, baja ? 'Inactivo' : 'Activo')) {
          this.mensaje.set(baja ? 'Alumno dado de baja.' : 'Alumno reactivado.');
        }
      });
  }
}
