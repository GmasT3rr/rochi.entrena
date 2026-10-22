import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuentaVista, normalizarConcepto } from '../../core/cuentas';
import { PageHeader } from '../../shared/page-header/page-header';
import { CuentaForm } from './cuenta-form';
import { CuotaDetalle } from './cuota-detalle';
import { GenerarMensual } from './generar-mensual';

@Component({
  imports: [
    CurrencyPipe,
    DatePipe,
    MatCard,
    MatCardContent,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
  ],
  selector: 'app-cuentas',
  styleUrl: './cuentas.scss',
  templateUrl: './cuentas.html',
})
export class Cuentas {
  readonly service = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  readonly busqueda = this.service.filtros.busqueda;
  readonly periodo = this.service.filtros.periodo;
  readonly estado = this.service.filtros.estado;
  readonly modalidad = this.service.filtros.modalidad;
  readonly alumnoId = this.service.filtros.alumnoId;
  readonly periodos = computed(() =>
    [...new Set(this.service.cuotas().map((c) => c.periodo))].sort().reverse(),
  );
  readonly cuentas = computed(() =>
    this.service
      .cuentas()
      .filter(
        (c) =>
          normalizarConcepto(c.alumno).includes(normalizarConcepto(this.busqueda())) &&
          (!this.alumnoId() || c.alumnoId === this.alumnoId()) &&
          (!this.periodo() || c.periodo === this.periodo()) &&
          (!this.estado() || c.estado === this.estado()) &&
          (!this.modalidad() || c.modalidad === this.modalidad()),
      ),
  );
  readonly columnas = [
    'alumno',
    'concepto',
    'importe',
    'abonado',
    'saldo',
    'vencimiento',
    'estado',
    'acciones',
  ];
  generar(): void {
    if (!this.service.disponible()) return;
    this.dialog.open(GenerarMensual, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  nueva(cuota?: CuentaVista): void {
    if (!this.service.disponible()) return;
    this.dialog.open(CuentaForm, {
      data: { tipo: 'cuota', cuota },
      width: '680px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  detalle(c: CuentaVista): void {
    this.dialog.open(CuotaDetalle, {
      data: c.id,
      width: '720px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  pago(cuota: CuentaVista): void {
    if (!this.service.disponible()) return;
    this.dialog.open(CuentaForm, {
      data: { tipo: 'pago', cuota },
      width: '600px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
}
