import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface DatoGrafico {
  label: string;
  valor: number;
}
@Component({
  selector: 'app-grafico-dashboard',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, MatTooltipModule],
  templateUrl: './grafico-dashboard.html',
  styleUrl: './grafico-dashboard.scss',
})
export class GraficoDashboard {
  readonly datos = input.required<DatoGrafico[]>();
  readonly titulo = input.required<string>();
  readonly monetario = input(false);
  readonly destacado = signal<string | null>(null);
  readonly maximo = computed(() => Math.max(1, ...this.datos().map((d) => d.valor)));
  readonly total = computed(() => this.datos().reduce((n, d) => n + d.valor, 0));
  readonly ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
  readonly puntos = computed(() =>
    this.datos().map((d, i, datos) => ({
      ...d,
      x: datos.length === 1 ? 52 : 10 + (i / (datos.length - 1)) * 86,
      y: 78 - (d.valor / this.maximo()) * 66,
      etiqueta: i === 0 || i === datos.length - 1 || i % Math.ceil(datos.length / 6) === 0,
    })),
  );
  readonly linea = computed(() =>
    this.puntos()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
  readonly segmentos = computed(() => {
    let offset = 0;
    return this.datos().map((d, i) => {
      const porcentaje = this.total() ? (d.valor / this.total()) * 100 : 0;
      const segmento = { ...d, porcentaje, offset, color: `var(--chart-${(i % 4) + 1})` };
      offset += porcentaje;
      return segmento;
    });
  });
  detalle(dato: DatoGrafico): string {
    return this.monetario()
      ? dato.label + ': ' + this.ars.format(dato.valor)
      : dato.label +
          ': ' +
          dato.valor +
          ' (' +
          (this.total() ? (dato.valor / this.total()) * 100 : 0).toFixed(1) +
          '%)';
  }
}
