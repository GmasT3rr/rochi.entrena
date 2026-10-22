import { Component, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { PageHeader } from '../../shared/page-header/page-header';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { StatCard } from '../../shared/stat-card/stat-card';
import { ResumenDashboard } from '../../core/services/resumen-dashboard';

@Component({
  selector: 'app-dashboard',
  imports: [
    PageHeader,
    MatCard,
    MatCardContent,
    CurrencyPipe,
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
