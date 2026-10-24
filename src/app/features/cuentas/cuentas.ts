import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { PeriodSelector } from '../../shared/period-selector';
import { MobileSort } from '../../shared/mobile-sort';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from '../../core/services/toast-service';
import { periodoValido } from '../../core/cuentas';
import { MatSortModule } from '@angular/material/sort';
import { ordenar } from '../../core/services/orden-tabla';
import { LoadingLayout } from '../../shared/skeleton/loading-layout';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, untracked, inject, signal } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CuentasService } from '../../core/services/cuentas-service';
import { CuentaVista, normalizarConcepto, centavos } from '../../core/cuentas';
import { PageHeader } from '../../shared/page-header/page-header';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { confirmarEliminarCuota } from './confirmar-eliminar-cuota';
import { CuentaForm } from './cuenta-form';
import { CuotaDetalle } from './cuota-detalle';
import { GenerarMensual } from './generar-mensual';

@Component({
  imports: [
    NgTemplateOutlet,
    MatExpansionModule,
    PeriodSelector,
    MobileSort,
    MatSortModule,
    RouterLink,
    LoadingLayout,
    CurrencyPipe,
    MatIconModule,
    MatTooltipModule,
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
  readonly filtrosMoviles = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 599.98px)')
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );
  private readonly contexto = signal<{ periodo: string | null; alumno: string | null } | null>(
    null,
  );
  constructor() {
    const toast = inject(ToastService);
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.contexto.set({ periodo: params.get('periodo'), alumno: params.get('alumno') });
      });
    effect(() => {
      const contexto = this.contexto();
      if (!contexto || !this.service.disponible()) return;
      untracked(() => {
        this.contexto.set(null);
        if (!contexto.periodo && !contexto.alumno) return;
        const clave = JSON.stringify(contexto);
        if (this.service.contextoListado === clave) return;
        const alumno = contexto.alumno;
        if (
          (contexto.periodo && !periodoValido(contexto.periodo)) ||
          (alumno && !this.service.alumnos().some((a) => a.id === alumno))
        ) {
          toast.mostrar(
            'El filtro solicitado no está disponible. Podés elegirlo desde el listado.',
            'informacion',
          );
          return;
        }
        this.busqueda.set('');
        this.service.contextoListado = clave;
        this.estado.set('');
        this.modalidad.set('');
        this.periodo.set(contexto.periodo ?? '');
        this.alumnoId.set(alumno ?? '');
      });
    });
  }
  readonly confirmandoEliminar = signal(false);
  async eliminar(cuota: CuentaVista): Promise<void> {
    if (this.confirmandoEliminar() || !this.service.disponible() || cuota.pagos.length) return;
    this.confirmandoEliminar.set(true);
    try {
      await confirmarEliminarCuota(this.dialog, this.service, cuota);
    } finally {
      this.confirmandoEliminar.set(false);
    }
  }
  readonly service = inject(CuentasService);
  private readonly dialog = inject(MatDialog);
  readonly orden = this.service.orden;
  readonly busqueda = this.service.filtros.busqueda;
  readonly periodo = this.service.filtros.periodo;
  readonly estado = this.service.filtros.estado;
  readonly modalidad = this.service.filtros.modalidad;
  readonly alumnoId = this.service.filtros.alumnoId;
  readonly periodos = computed(() =>
    [
      ...new Set(
        [
          this.service.hoy().slice(0, 7),
          this.periodo(),
          ...this.service.cuotas().map((c) => c.periodo),
        ].filter(Boolean),
      ),
    ]
      .sort()
      .reverse(),
  );
  limpiarFiltros(): void {
    this.busqueda.set('');
    this.alumnoId.set('');
    this.periodo.set('');
    this.estado.set('');
    this.modalidad.set('');
  }
  // El resumen usa el período, independientemente de los filtros del listado.
  readonly resumen = computed(() => {
    const cuotas = this.service
      .cuentas()
      .filter((c) => !this.periodo() || c.periodo === this.periodo());
    return {
      cobrado:
        this.service
          .pagos()
          .filter((p) => !this.periodo() || p.fecha.slice(0, 7) === this.periodo())
          .reduce((n, p) => n + centavos(p.importe), 0) / 100,
      pendiente: cuotas.reduce((n, c) => n + centavos(c.saldo), 0) / 100,
      vencido:
        cuotas.filter((c) => c.estado === 'Vencida').reduce((n, c) => n + centavos(c.saldo), 0) /
        100,
    };
  });
  readonly cuentas = computed(() =>
    ordenar(
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
      this.orden(),
      (c, k) => c[k as keyof CuentaVista] as string | number,
    ),
  );
  readonly columnas = ['alumno', 'concepto', 'saldo', 'estado', 'vencimiento', 'acciones'];
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
      closeOnNavigation: false,
      data: { tipo: 'cuota', cuota },
      width: '680px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  detalle(c: CuentaVista): void {
    this.dialog.open(CuotaDetalle, {
      data: c.id,
      width: '760px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
  pago(cuota: CuentaVista): void {
    if (
      !this.service.disponible() ||
      cuota.saldo <= 0 ||
      this.dialog.openDialogs.some((d) => d.componentInstance instanceof CuentaForm)
    )
      return;
    this.dialog.open(CuentaForm, {
      closeOnNavigation: false,
      data: { tipo: 'pago', cuota },
      width: '600px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '90dvh',
    });
  }
}
