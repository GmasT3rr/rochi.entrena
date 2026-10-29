import { AlumnoEstadoAcciones } from './alumno-estado-acciones';
import { MobileSort } from '../../shared/mobile-sort';
import { MatSortModule } from '@angular/material/sort';
import { ordenar } from '../../core/services/orden-tabla';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { Component, computed, inject, signal, DestroyRef, Injector } from '@angular/core';
import { CuentasService } from '../../core/services/cuentas-service';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AlumnoRegistro } from '../../core/alumno';
import { AlumnosService } from '../../core/services/alumnos-service';
import { PageHeader } from '../../shared/page-header/page-header';
import { AlumnoForm } from './alumno-form';
import { AlumnoFicha } from './alumno-ficha';

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

@Component({
  imports: [
    MobileSort,
    MatSortModule,
    LoadingLayout,
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
  readonly estadoAcciones = inject(AlumnoEstadoAcciones);
  cambiarEstado(alumno: AlumnoRegistro): void {
    if (!this.fichaAbierta() && !this.formularioAbierto()) void this.estadoAcciones.cambiar(alumno);
  }
  readonly service = inject(AlumnosService);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  readonly orden = this.service.orden;
  readonly busqueda = this.service.filtros.busqueda;
  readonly modalidad = this.service.filtros.modalidad;
  readonly estado = this.service.filtros.estado;
  constructor() {
    this.service.refrescarSiNecesario();
    const refrescar = () => {
      if (!document.hidden) this.service.refrescarSiNecesario();
    };
    window.addEventListener('focus', refrescar);
    document.addEventListener('visibilitychange', refrescar);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('focus', refrescar);
      document.removeEventListener('visibilitychange', refrescar);
    });
  }
  readonly mensaje = signal('');
  readonly formularioAbierto = signal(false);
  readonly fichaAbierta = signal(false);
  readonly columnas = ['nombre', 'modalidad', 'estado', 'acciones'];
  readonly alumnos = computed(() => {
    const texto = normalizar(this.busqueda().trim());
    return ordenar(
      this.service
        .alumnos()
        .filter(
          (a) =>
            (!this.modalidad() || a.modalidad === this.modalidad()) &&
            (!this.estado() || a.estado === this.estado()) &&
            normalizar(`${a.nombre} ${a.apellido} ${a.email} ${a.telefono}`).includes(texto),
        ),
      this.orden(),
      (a, k) => (k === 'nombre' ? a.nombre + ' ' + a.apellido : a[k as 'modalidad' | 'estado']),
    );
  });

  agregar(): void {
    if (this.formularioAbierto() || this.fichaAbierta()) return;
    this.formularioAbierto.set(true);
    this.mensaje.set('');
    this.service.error.set('');
    this.dialog
      .open(AlumnoForm, {
        closeOnNavigation: false,
        data: null,
        width: '680px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      })
      .afterClosed()
      .subscribe((guardado) => {
        this.formularioAbierto.set(false);
        // El error del guardado pertenece al diálogo que acaba de cerrarse.
        this.service.error.set('');
        this.service.detalleError.set(null);
        if (guardado) {
          this.mensaje.set(this.service.mensaje());
          // Solo lectura tras la RPC confirmada: actualizar cuotas y alumnos financieros.
          void this.injector.get(CuentasService).recargar();
        }
      });
  }

  ficha(alumno: AlumnoRegistro): void {
    if (this.fichaAbierta() || this.formularioAbierto()) return;
    this.fichaAbierta.set(true);
    this.service.error.set('');
    this.dialog
      .open(AlumnoFicha, {
        data: alumno.id,
        width: '960px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      })
      .afterClosed()
      .subscribe(() => {
        this.fichaAbierta.set(false);
        this.service.error.set('');
        this.service.detalleError.set(null);
      });
  }
}
