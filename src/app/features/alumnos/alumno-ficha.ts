import { StatCard } from '../../shared/stat-card/stat-card';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { AlumnoEntrenamiento } from './alumno-entrenamiento';
import { AlumnoDocumentos } from './alumno-documentos';
import { AlumnoForm, SeccionAlumno } from './alumno-form';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { AlumnoFinanzas } from './alumno-finanzas';
import { Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { AlumnoEstadoAcciones } from './alumno-estado-acciones';
import { cuotasMensualesDelPeriodo } from '../../core/cuentas';
import { CuentaForm } from '../cuentas/cuenta-form';

@Component({
  selector: 'app-alumno-ficha',
  imports: [
    MatTabsModule,
    StatCard,
    MatCardModule,
    MatIconModule,
    AlumnoEntrenamiento,
    AlumnoDocumentos,
    LoadingLayout,
    AlumnoFinanzas,
    CurrencyPipe,
    DatePipe,
    MatDialogModule,
    MatButtonModule,
  ],
  styleUrl: './alumno-ficha.scss',
  templateUrl: './alumno-ficha.html',
})
export class AlumnoFicha {
  private readonly router = inject(Router);
  private readonly ref = inject(MatDialogRef<AlumnoFicha>);
  async verCuentas(id: string): Promise<void> {
    if (await this.router.navigate(['/cuentas'], { queryParams: { alumno: id } })) this.ref.close();
  }
  readonly cuentas = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  readonly estadoAcciones = inject(AlumnoEstadoAcciones);
  constructor() {
    this.cuentas.refrescarSiNecesario();
  }
  readonly editando = signal(false);
  readonly cambiandoEstado = this.estadoAcciones.cambiandoEstado;
  readonly errorEstado = this.estadoAcciones.errorEstado;
  readonly ocupado = computed(
    () =>
      this.editando() ||
      this.cambiandoEstado() ||
      this.service.guardando() ||
      this.service.cargando(),
  );
  editar(seccion: SeccionAlumno): void {
    const alumno = this.alumno();
    if (!alumno || this.ocupado()) return;
    this.editando.set(true);
    this.errorEstado.set('');
    this.service.error.set('');
    this.dialog
      .open(AlumnoForm, {
        closeOnNavigation: false,
        data: { alumno, seccion },
        width: '680px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      })
      .afterClosed()
      .subscribe(() => {
        this.editando.set(false);
        this.service.error.set('');
        this.service.detalleError.set(null);
      });
  }
  async cambiarEstado(): Promise<void> {
    const alumno = this.alumno();
    if (alumno && !this.ocupado()) await this.estadoAcciones.cambiar(alumno);
  }
  cerrar(): void {
    this.ref.close();
  }
  private readonly id = inject<string>(MAT_DIALOG_DATA);
  readonly service = inject(AlumnosService);
  readonly alumno = computed(() => this.service.alumnos().find((a) => a.id === this.id));
  readonly periodoActual = computed(() => this.cuentas.hoy().slice(0, 7));
  readonly cuotasMensualesActuales = computed(() =>
    cuotasMensualesDelPeriodo(this.cuentas.cuotasAlumno(this.id), this.id, this.periodoActual()),
  );
  readonly cuotaActual = computed(() =>
    this.cuotasMensualesActuales().length === 1 ? this.cuotasMensualesActuales()[0] : undefined,
  );
  editarCuotaActual(): void {
    const cuota = this.cuotaActual();
    if (!cuota || this.ocupado() || !this.cuentas.disponible()) return;
    this.editando.set(true);
    this.dialog
      .open(CuentaForm, {
        closeOnNavigation: false,
        data: { tipo: 'cuota', cuota },
        width: '720px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      })
      .afterClosed()
      .subscribe(() => this.editando.set(false));
  }
  readonly iniciales = computed(() => {
    const a = this.alumno();
    return (
      (a?.nombre.trim().charAt(0) ?? '') + (a?.apellido.trim().charAt(0) ?? '')
    ).toLocaleUpperCase('es-AR');
  });
}
