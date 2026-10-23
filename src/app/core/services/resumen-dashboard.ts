import { computed, inject, Injectable, signal } from '@angular/core';
import { centavos } from '../cuentas';
import { CuentasService } from './cuentas-service';

export const PERIODO_DASHBOARD_KEY = 'tuscuentasfacil.dashboard.periodo.v1';
const periodoValido = (valor: unknown): valor is string =>
  typeof valor === 'string' &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) &&
  valor >= '1900-01' &&
  valor <= '9999-12';

@Injectable({ providedIn: 'root' })
export class ResumenDashboard {
  readonly cuentas = inject(CuentasService);
  private restaurarPeriodo(): string {
    try {
      const guardado = localStorage.getItem(PERIODO_DASHBOARD_KEY);
      if (periodoValido(guardado)) return guardado;
    } catch {
      /* La preferencia es opcional si el navegador bloquea almacenamiento. */
    }
    return this.cuentas.hoy().slice(0, 7);
  }
  private readonly seleccion = signal(this.restaurarPeriodo());
  readonly periodo = this.seleccion.asReadonly();
  elegirPeriodo(valor: string): void {
    if (!periodoValido(valor) || valor === this.periodo()) return;
    this.seleccion.set(valor);
    try {
      localStorage.setItem(PERIODO_DASHBOARD_KEY, valor);
    } catch {
      /* Conservar en memoria. */
    }
  }
  readonly mesesEvolucion = signal<3 | 6 | 12 | 24>(12);
  readonly evolucion = computed(() => {
    const [anio, mes] = this.periodo().split('-').map(Number);
    const ultimo = anio * 12 + mes - 1;
    const porMes = new Map<string, number>();
    for (const pago of this.cuentas.pagos()) {
      const periodo = pago.fecha.slice(0, 7);
      porMes.set(periodo, (porMes.get(periodo) ?? 0) + centavos(pago.importe));
    }
    return Array.from(
      { length: this.mesesEvolucion() },
      (_, i) => ultimo - this.mesesEvolucion() + 1 + i,
    )
      .filter((indice) => indice >= 1900 * 12)
      .map((indice) => {
        const periodo =
          Math.floor(indice / 12)
            .toString()
            .padStart(4, '0') +
          '-' +
          ((indice % 12) + 1).toString().padStart(2, '0');
        return { label: periodo, valor: (porMes.get(periodo) ?? 0) / 100 };
      });
  });
  readonly emitido = computed(
    () => this.cuotas().reduce((n, c) => n + centavos(c.importe), 0) / 100,
  );
  readonly abonadoPeriodo = computed(
    () => this.cuotas().reduce((n, c) => n + centavos(c.abonado), 0) / 100,
  );
  readonly cobranza = computed(() =>
    this.emitido() ? (this.abonadoPeriodo() / this.emitido()) * 100 : null,
  );
  readonly deudaVencida = computed(
    () =>
      this.cuotas()
        .filter((c) => c.estado === 'Vencida')
        .reduce((n, c) => n + centavos(c.saldo), 0) / 100,
  );
  readonly alumnosConDeuda = computed(
    () =>
      new Set(
        this.cuotas()
          .filter((c) => c.saldo > 0)
          .map((c) => c.alumnoId),
      ).size,
  );
  readonly estados = computed(() =>
    ['Pagada', 'Parcial', 'Pendiente', 'Vencida'].map((estado, i) => ({
      label: ['Pagadas', 'Parciales', 'Pendientes', 'Vencidas'][i],
      valor: this.cuotas().filter((c) => c.estado === estado).length,
    })),
  );
  readonly modalidades = computed(() => [
    { label: 'Presenciales', valor: this.presenciales() },
    { label: 'Online', valor: this.online() },
  ]);
  readonly comparacionIngresos = computed(() => {
    const evolucion = this.evolucion();
    if (evolucion.length < 2) return null;
    const anterior = evolucion[evolucion.length - 2].valor;
    return {
      anterior,
      diferencia: this.ingresos() - anterior,
      porcentaje: anterior ? ((this.ingresos() - anterior) / anterior) * 100 : null,
    };
  });
  readonly activos = computed(() => this.cuentas.alumnos().filter((a) => a.estado === 'Activo'));
  readonly presenciales = computed(
    () => this.activos().filter((a) => a.modalidad === 'Presencial').length,
  );
  readonly online = computed(() => this.activos().filter((a) => a.modalidad === 'Online').length);
  readonly cuotas = computed(() =>
    this.cuentas.cuentas().filter((c) => c.periodo === this.periodo()),
  );
  readonly ingresos = computed(
    () =>
      this.cuentas
        .pagos()
        .filter((p) => p.fecha.slice(0, 7) === this.periodo())
        .reduce((total, p) => total + centavos(p.importe), 0) / 100,
  );
  readonly pendiente = computed(
    () => this.cuotas().reduce((total, c) => total + centavos(c.saldo), 0) / 100,
  );
  readonly vencidas = computed(() => this.cuotas().filter((c) => c.estado === 'Vencida').length);
  readonly pagadas = computed(() => this.cuotas().filter((c) => c.estado === 'Pagada').length);
  readonly parciales = computed(
    () => this.cuotas().filter((c) => c.abonado > 0 && c.saldo > 0).length,
  );
  readonly deudas = computed(() =>
    [...this.cuotas()]
      .filter((c) => c.saldo > 0)
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.id.localeCompare(b.id))
      .slice(0, 8),
  );
  readonly vacio = computed(
    () =>
      !this.cuentas.alumnos().length &&
      !this.cuentas.cuotas().length &&
      !this.cuentas.pagos().length,
  );
}
