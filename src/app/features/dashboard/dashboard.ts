import { MatSortModule, Sort } from '@angular/material/sort';
import { ordenar } from '../../core/services/orden-tabla';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { PageHeader } from '../../shared/page-header/page-header';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { Component, computed, signal, inject } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { GraficoDashboard } from './grafico-dashboard';
import { StatCard } from '../../shared/stat-card/stat-card';
import { ResumenDashboard } from '../../core/services/resumen-dashboard';

@Component({
  selector: 'app-dashboard',
  imports: [
    MatSortModule,
    RouterLink,
    MatButtonModule,
    LoadingLayout,
    PageHeader,
    MatCard,
    MatCardContent,
    CurrencyPipe,
    DecimalPipe,
    GraficoDashboard,
    DatePipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    StatCard,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly resumen = inject(ResumenDashboard);
  readonly ordenDeudas = signal<Sort>({ active: 'vencimiento', direction: 'asc' });
  readonly deudas = computed(() =>
    ordenar(
      this.resumen.deudas(),
      this.ordenDeudas(),
      (c, k) => c[k as 'alumno' | 'vencimiento' | 'saldo' | 'estado'],
    ),
  );
  readonly cuentas = this.resumen.cuentas;
  readonly meses = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  cambiarMes(mes: string): void {
    this.resumen.elegirPeriodo(this.resumen.periodo().slice(0, 4) + '-' + mes);
  }
  cambiarAnio(valor: string): void {
    if (/^\d{4}$/.test(valor)) this.resumen.elegirPeriodo(valor + this.resumen.periodo().slice(4));
  }
}
