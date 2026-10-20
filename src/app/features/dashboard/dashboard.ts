import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { AlumnosService } from '../../core/services/alumnos-service';
import { MockData } from '../../core/services/mock-data';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatCard } from '../../shared/stat-card/stat-card';

@Component({
  imports: [CurrencyPipe, DatePipe, NgClass, MatCard, MatCardHeader, MatCardTitle, MatCardContent, PageHeader, StatCard],
  selector: 'app-dashboard',
  styleUrl: './dashboard.scss',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly mockData = inject(MockData);

  readonly alumnosService = inject(AlumnosService);

  readonly resumen = this.mockData.resumen;
  readonly actividades = this.mockData.actividades;
  readonly vencimientos = this.mockData.pagos.filter((pago) => pago.estado !== 'Pagado').slice(0, 4);
}
