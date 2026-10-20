import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MockData } from '../../core/services/mock-data';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  imports: [CurrencyPipe, DatePipe, NgClass, MatCard, MatCardContent, MatTableModule, PageHeader],
  selector: 'app-cuentas',
  styleUrl: './cuentas.scss',
  templateUrl: './cuentas.html',
})
export class Cuentas {
  private readonly mockData = inject(MockData);

  readonly pagos = this.mockData.pagos;
  readonly columnas = ['alumno', 'concepto', 'vencimiento', 'monto', 'estado'];
}
