import { CobrosDirectosAcciones } from './cobros-directos-acciones';
import { DescargasService } from '../../core/services/descargas-service';
import { Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CuentasService } from '../../core/services/cuentas-service';
import { CobroDirecto } from '../../core/cobros-directos';
import { normalizarConcepto } from '../../core/cuentas';
import { csv } from '../../core/respaldo';
@Component({
  selector: 'app-cobros-directos',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './cobros-directos.html',
  styleUrl: './cobros-directos.scss',
})
export class CobrosDirectos {
  readonly alumno = input('');
  readonly service = inject(CuentasService);
  private readonly acciones = inject(CobrosDirectosAcciones);
  private readonly descargas = inject(DescargasService);
  readonly desde = signal('');
  readonly hasta = signal('');
  readonly alumnoFiltro = signal('');
  readonly concepto = signal('');
  readonly confirmando = this.acciones.confirmando;
  readonly filas = computed(() =>
    this.service
      .cobrosDirectos()
      .filter(
        (c) =>
          (!this.alumno() || c.alumnoId === this.alumno()) &&
          (!this.alumnoFiltro() || c.alumnoId === this.alumnoFiltro()) &&
          (!this.desde() || c.fecha >= this.desde()) &&
          (!this.hasta() || c.fecha <= this.hasta()) &&
          normalizarConcepto(c.concepto).includes(normalizarConcepto(this.concepto())),
      )
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id)),
  );
  nombre(id: string): string {
    const a = this.service.alumnos().find((a) => a.id === id);
    return a ? a.nombre + ' ' + a.apellido : '';
  }
  abrir(cobro?: CobroDirecto, lectura = false): void {
    this.acciones.abrir(cobro, lectura);
  }
  eliminar(c: CobroDirecto): Promise<void> {
    return this.acciones.eliminar(c);
  }
  exportar(consolidado = false): void {
    const contenido = csv([
      ['Tipo', 'ID', 'Alumno', 'Concepto', 'Importe (ARS)', 'Fecha', 'Medio', 'Observaciones'],
      ...(consolidado
        ? this.service.ingresos()
        : this.filas().map((c) => ({ ...c, tipo: 'Cobro directo' }))
      ).map((c) => [
        c.tipo,
        c.id,
        this.nombre(c.alumnoId),
        c.concepto,
        c.importe,
        c.fecha,
        c.medio,
        c.observaciones,
      ]),
    ]);
    this.descargas.descargar(
      consolidado ? 'ingresos.csv' : 'cobros-directos.csv',
      contenido,
      'text/csv;charset=utf-8',
    );
  }
}
