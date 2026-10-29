import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuentaVista } from '../../core/cuentas';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { movimientosVista, MovimientoVista } from '../cuentas/movimientos-vista';
import { CobrosDirectosAcciones } from '../cuentas/cobros-directos-acciones';
import { CuentaForm } from '../cuentas/cuenta-form';
import { Router } from '@angular/router';
import { StatCard } from '../../shared/stat-card/stat-card';

@Component({
  selector: 'app-alumno-finanzas',
  imports: [CurrencyPipe, DatePipe, MatButtonModule, MatMenuModule, LoadingLayout, StatCard],
  templateUrl: './alumno-finanzas.html',
  styleUrl: './alumno-finanzas.scss',
})
export class AlumnoFinanzas {
  readonly alumno = input.required<string>();
  readonly navegar = output<void>();
  readonly cuentas = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  private readonly cobros = inject(CobrosDirectosAcciones);
  private readonly router = inject(Router);
  readonly cuotas = computed(() => this.cuentas.cuotasAlumno(this.alumno()));
  readonly pendientes = computed(() => this.cuotas().filter((c) => c.saldo > 0).length);
  readonly movimientos = computed(() =>
    movimientosVista(
      this.cuotas(),
      this.cuentas.cobrosDirectos().filter((c) => c.alumnoId === this.alumno()),
      this.cuentas.alumnos(),
    ).sort((a, b) => b.fechaOrden.localeCompare(a.fechaOrden) || a.clave.localeCompare(b.clave)),
  );
  async verCuentas(): Promise<void> {
    if (await this.router.navigate(['/cuentas'], { queryParams: { alumno: this.alumno() } }))
      this.navegar.emit();
  }
  nuevaCuota(): void {
    if (!this.cuentas.disponible()) return;
    this.dialog.open(CuentaForm, {
      data: { tipo: 'cuota', alumnoId: this.alumno() },
      closeOnNavigation: false,
      width: '680px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  cobroDirecto(): void {
    this.cobros.abrir(undefined, this.alumno());
  }
  editar(m: MovimientoVista): void {
    if (m.tipo === 'directo') {
      this.cobros.abrir(m.cobro, this.alumno());
      return;
    }
    this.dialog.open(CuentaForm, {
      closeOnNavigation: false,
      data: { tipo: 'cuota', cuota: m.cuota },
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  pago(cuota: CuentaVista): void {
    if (!this.cuentas.disponible() || cuota.saldo <= 0) return;
    this.dialog.open(CuentaForm, {
      data: { tipo: 'pago', cuota },
      closeOnNavigation: false,
      width: '600px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
}
