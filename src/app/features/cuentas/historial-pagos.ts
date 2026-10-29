import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { normalizarConcepto, PagoCuota } from '../../core/cuentas';
import { ordenar } from '../../core/services/orden-tabla';

/** Historial extraído del antiguo detalle; sin otro modal ni formulario de pagos. */
@Component({
  selector: 'app-historial-pagos',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './historial-pagos.html',
  styleUrl: './historial-pagos.scss',
})
export class HistorialPagos {
  readonly pagos = input.required<PagoCuota[]>();
  readonly bloqueado = input(false);
  readonly editar = output<PagoCuota>();
  readonly eliminar = output<PagoCuota>();
  readonly ordenPagos = signal<Sort>({ active: 'fecha', direction: 'desc' });
  readonly busquedaPagos = signal('');
  readonly pagosVisibles = computed(() =>
    ordenar(
      this.pagos().filter((p) =>
        normalizarConcepto(p.medio + ' ' + p.observaciones + ' ' + p.fecha).includes(
          normalizarConcepto(this.busquedaPagos()),
        ),
      ),
      this.ordenPagos(),
      (p, k) => p[k as 'fecha' | 'importe' | 'medio'],
    ),
  );
  ordenarPagos(valor: string): void {
    const [active, direction] = valor.split(':');
    this.ordenPagos.set({ active, direction: direction as 'asc' | 'desc' });
  }
}
