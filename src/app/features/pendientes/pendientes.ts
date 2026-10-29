import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Component, computed, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/page-header/page-header';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { CuentasService } from '../../core/services/cuentas-service';
import { clasificarPendientes, CategoriaPendiente } from '../../core/services/pendientes';
import { CuentaVista, normalizarConcepto, centavos } from '../../core/cuentas';
import { CuentaForm } from '../cuentas/cuenta-form';
@Component({
  selector: 'app-pendientes',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    RouterLink,
    PageHeader,
    LoadingLayout,
  ],
  templateUrl: './pendientes.html',
  styleUrl: './pendientes.scss',
})
export class Pendientes {
  readonly service = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  readonly categoria = this.service.filtrosPendientes.categoria;
  readonly busqueda = this.service.filtrosPendientes.busqueda;
  constructor() {
    // Evitar otra consulta al recrearse la vista durante una escritura o carga.
    this.service.refrescarSiNecesario();
  }
  readonly categorias: { id: CategoriaPendiente; label: string }[] = [
    { id: 'vencida', label: 'Vencidas' },
    { id: 'proxima', label: 'Próximas a vencer' },
    { id: 'parcial', label: 'Parciales' },
    { id: 'pendiente', label: 'Otros saldos' },
  ];
  readonly pendientes = computed(() =>
    clasificarPendientes(this.service.cuentas(), this.service.hoy()),
  );
  readonly total = computed(
    () => this.pendientes().reduce((sum, p) => sum + centavos(p.cuota.saldo), 0) / 100,
  );
  readonly visibles = computed(() =>
    this.pendientes().filter(
      (p) =>
        (!this.categoria() || p.categoria === this.categoria()) &&
        normalizarConcepto(p.cuota.alumno + ' ' + p.cuota.concepto).includes(
          normalizarConcepto(this.busqueda()),
        ),
    ),
  );
  contar(categoria: CategoriaPendiente) {
    return this.pendientes().filter((p) => p.categoria === categoria).length;
  }
  etiqueta(categoria: CategoriaPendiente) {
    return this.categorias.find((c) => c.id === categoria)!.label;
  }
  detalle(cuota: CuentaVista) {
    this.dialog.open(CuentaForm, {
      closeOnNavigation: false,
      data: { tipo: 'cuota', cuota },
      width: '760px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  pagar(cuota: CuentaVista) {
    const actual = this.service.cuentas().find((c) => c.id === cuota.id);
    if (
      this.service.disponible() &&
      actual &&
      centavos(actual.saldo) > 0 &&
      !this.dialog.openDialogs.some((d) => d.componentInstance instanceof CuentaForm)
    )
      this.dialog.open(CuentaForm, {
        closeOnNavigation: false,
        data: { tipo: 'pago', cuota: actual },
        width: '600px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: '90dvh',
      });
  }
}
