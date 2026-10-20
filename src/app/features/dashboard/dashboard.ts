import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { AlumnosService } from '../../core/services/alumnos-service';
import { CuentasService } from '../../core/services/cuentas-service';
import { PageHeader } from '../../shared/page-header/page-header';
import { StatCard } from '../../shared/stat-card/stat-card';

@Component({
  imports: [
    CurrencyPipe,
    DatePipe,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    PageHeader,
    StatCard,
  ],
  selector: 'app-dashboard',
  styleUrl: './dashboard.scss',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  readonly alumnosService = inject(AlumnosService);
  readonly cuentas = inject(CuentasService);
  readonly actividades = computed(() =>
    [...this.cuentas.pagos()]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 4)
      .map((p) => {
        const c = this.cuentas.cuentas().find((c) => c.id === p.cuotaId);
        return { ...p, alumno: c?.alumno ?? 'Alumno no disponible', concepto: c?.concepto ?? '' };
      }),
  );
}
