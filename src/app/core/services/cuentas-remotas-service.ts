import { MinimumLoading } from '../../shared/skeleton/minimum-loading';
import { CobroDirecto, validarCobroDirecto } from '../cobros-directos';
import { Sort } from '@angular/material/sort';
import { ToastService } from './toast-service';
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import {
  CuentasData,
  CuentaVista,
  DatosCuota,
  DatosPago,
  centavos,
  normalizarConcepto,
  validarCuentas,
  EstadoCuota,
} from '../cuentas';
import { ModalidadAlumno } from '../alumno';
import { CategoriaPendiente } from './pendientes';
import { ResultadoMensual, VistaMensualRemota } from '../mensual';
import { AuthService } from '../auth/auth-service';
import {
  CuentasSnapshot,
  CuentasSupabaseRepository,
  VersionFinanciera,
} from './cuentas-supabase-repository';

export function fechaArgentina(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const vacio = (): CuentasSnapshot => ({
  version: 1,
  alumnos: [],
  cuotas: [],
  pagos: [],
  versionesCuotas: {},
  versionesPagos: {},
});

@Injectable({ providedIn: 'root' })
export class CuentasService {
  readonly orden = signal<Sort>({ active: 'vencimiento', direction: 'asc' });
  private readonly toast = inject(ToastService);
  private readonly repository = inject(CuentasSupabaseRepository);
  private readonly auth = inject(AuthService);
  private readonly datos = signal<CuentasSnapshot>(vacio());
  readonly hoy = signal(fechaArgentina());
  contextoListado: string | null = null;
  readonly error = signal('');
  readonly errorCarga = signal('');
  readonly mensaje = signal('');
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  // Mantener los filtros al recrearse la vista durante una comprobación de permisos.
  readonly filtros = {
    tipo: signal<'' | 'cuota' | 'directo'>(''),
    busqueda: signal(''),
    periodo: signal(this.hoy().slice(0, 7)),
    alumnoId: signal(''),
    estado: signal<EstadoCuota | 'Cobrado' | ''>(''),
    modalidad: signal<ModalidadAlumno | ''>(''),
  };
  // Independientes del período y los filtros del listado de cuotas.
  readonly filtrosPendientes = {
    categoria: signal<CategoriaPendiente | ''>(''),
    busqueda: signal(''),
  };
  private readonly cargado = signal(false);
  readonly tieneDatos = this.cargado.asReadonly();
  readonly disponible = computed(() => this.cargado() && !this.cargando() && !this.guardando());
  readonly alumnos = computed(() => this.datos().alumnos);
  readonly cuotas = computed(() => this.datos().cuotas);
  readonly pagos = computed(() => this.datos().pagos);
  readonly cobrosDirectos = computed(() => this.datos().cobrosDirectos ?? []);
  readonly ingresos = computed(() => [
    ...this.pagos().map((p) => {
      const cuota = this.cuotas().find((c) => c.id === p.cuotaId)!;
      return { ...p, alumnoId: cuota.alumnoId, concepto: cuota.concepto, tipo: 'Pago de cuota' };
    }),
    ...this.cobrosDirectos().map((c) => ({ ...c, tipo: 'Cobro directo' })),
  ]);
  versionCobro(id: string): VersionFinanciera | undefined {
    return this.datos().versionesCobros?.[id];
  }
  async guardarCobro(
    datos: CobroDirecto,
    crear: boolean,
    version?: VersionFinanciera,
  ): Promise<boolean> {
    const cobro = {
      ...datos,
      concepto: datos.concepto.trim(),
      observaciones: datos.observaciones.trim(),
    };
    try {
      validarCobroDirecto(cobro);
      if (cobro.fecha > this.hoy()) throw Error('La fecha de cobro no puede ser futura.');
      if (!this.alumnos().some((a) => a.id === cobro.alumnoId))
        throw Error('Seleccioná un alumno disponible.');
    } catch (e) {
      return this.fallar((e as Error).message);
    }
    return this.mutar(
      () => this.repository.guardarCobro(cobro, crear, version),
      'Cobro directo guardado.',
    );
  }
  async eliminarCobro(id: string, version?: VersionFinanciera): Promise<boolean> {
    return this.mutar(() => this.repository.eliminarCobro(id, version), 'Cobro directo eliminado.');
  }
  private generation = 0;
  private readonly loading = new MinimumLoading();
  readonly cargandoInicial = this.loading.visible.asReadonly();
  private ultimaCarga = 0;
  private ultimoIntentoCarga = 0;
  private sessionToken: string | undefined;
  refrescarSiNecesario(): void {
    if (this.cargando() || this.guardando()) return;
    const ahora = Date.now();
    if (this.cargado() && ahora - this.ultimaCarga < 60000) return;
    if (this.errorCarga() && ahora - this.ultimoIntentoCarga < 30000) return;
    void this.recargar();
  }
  readonly cuentas = computed<CuentaVista[]>(() =>
    this.cuotas().map((c) => {
      const a = this.alumnos().find((a) => a.id === c.alumnoId)!;
      const pagos = this.pagos()
        .filter((p) => p.cuotaId === c.id)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
      const abonado = pagos.reduce((n, p) => n + centavos(p.importe), 0);
      const saldo = centavos(c.importe) - abonado;
      return {
        ...c,
        alumno: `${a.nombre} ${a.apellido}`,
        modalidad: a.modalidad,
        pagos,
        abonado: abonado / 100,
        saldo: saldo / 100,
        estado:
          saldo === 0
            ? 'Pagada'
            : c.vencimiento < this.hoy()
              ? 'Vencida'
              : abonado > 0
                ? 'Parcial'
                : 'Pendiente',
      };
    }),
  );
  constructor() {
    const timer = setInterval(() => this.hoy.set(fechaArgentina()), 30000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.generation++;
      this.loading.cancel();
    });
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (token === this.sessionToken) return;
      this.sessionToken = token;
      untracked(() => {
        this.generation++;
        this.loading.cancel();
        this.ultimaCarga = 0;
        this.ultimoIntentoCarga = 0;
        this.datos.set(vacio());
        this.cargado.set(false);
        this.error.set('');
        this.errorCarga.set('');
        this.mensaje.set('');
        this.cargando.set(false);
        this.filtros.busqueda.set('');
        this.filtros.tipo.set('');
        this.filtros.periodo.set(this.hoy().slice(0, 7));
        this.contextoListado = null;
        this.filtros.alumnoId.set('');
        this.filtros.estado.set('');
        this.filtros.modalidad.set('');
        this.filtrosPendientes.categoria.set('');
        this.filtrosPendientes.busqueda.set('');
        if (token) void this.recargar();
      });
    });
  }
  versionCuota(id: string): VersionFinanciera | undefined {
    return this.datos().versionesCuotas[id];
  }
  versionPago(id: string): VersionFinanciera | undefined {
    return this.datos().versionesPagos[id];
  }
  cuotasAlumno(id: string): CuentaVista[] {
    return this.cuentas().filter((c) => c.alumnoId === id);
  }
  saldoAlumno(id: string): number {
    return this.cuotasAlumno(id).reduce((n, c) => n + centavos(c.saldo), 0) / 100;
  }
  proximaCuota(id: string): string | null {
    return (
      this.cuotasAlumno(id)
        .filter((c) => c.saldo > 0)
        .map((c) => c.vencimiento)
        .sort()[0] ?? null
    );
  }
  async recargar(): Promise<void> {
    if (this.guardando()) return;
    this.ultimoIntentoCarga = Date.now();
    const generation = ++this.generation;
    const finalizarVisual = this.loading.begin(!this.cargado());
    this.cargando.set(true);
    this.error.set('');
    this.errorCarga.set('');
    this.mensaje.set('');
    try {
      const data = await this.repository.cargar();
      if (generation === this.generation) {
        this.datos.set(data);
        this.ultimaCarga = Date.now();
        this.cargado.set(true);
      }
    } catch (error) {
      if (generation === this.generation) {
        if ((error as { code?: string })?.code === '42501') {
          this.datos.set(vacio());
          this.cargado.set(false);
        }
        this.fallar(errorFinanciero(error));
        this.errorCarga.set(this.error());
      }
    } finally {
      finalizarVisual();
      if (generation === this.generation) this.cargando.set(false);
    }
  }
  private fallar(error: string): false {
    this.mensaje.set('');
    this.error.set(error);
    this.toast.mostrar(error, 'error');
    return false;
  }
  private validar(data: CuentasData): boolean {
    try {
      validarCuentas(data);
      if (data.cuotas.some((c) => !this.alumnos().some((a) => a.id === c.alumnoId)))
        throw Error('Seleccioná un alumno disponible en el listado.');
      return true;
    } catch (error) {
      return this.fallar(error instanceof Error ? error.message : 'Datos inválidos.');
    }
  }
  async guardarCuota(
    datos: DatosCuota,
    id?: string,
    nuevoId?: string,
    version = id ? this.versionCuota(id) : undefined,
  ): Promise<boolean> {
    const anterior = this.cuotas().find((c) => c.id === id);
    if (id && (!anterior || anterior.alumnoId !== datos.alumnoId))
      return this.fallar('La cuota no existe o no puede trasladarse a otro alumno.');
    const cuota = {
      ...datos,
      id: id ?? nuevoId ?? crypto.randomUUID(),
      concepto: datos.concepto.trim().replace(/\s+/g, ' '),
      observaciones: datos.observaciones.trim(),
    };
    if (
      this.cuotas().some(
        (c) =>
          c.id !== id &&
          c.alumnoId === cuota.alumnoId &&
          c.periodo === cuota.periodo &&
          normalizarConcepto(c.concepto) === normalizarConcepto(cuota.concepto),
      )
    )
      return this.fallar('Ya existe una cuota con ese concepto y período para este alumno.');
    const data = {
      version: 1 as const,
      cuotas: id ? this.cuotas().map((c) => (c.id === id ? cuota : c)) : [...this.cuotas(), cuota],
      pagos: this.pagos(),
    };
    if (!this.validar(data)) return false;
    return this.mutar(() => this.repository.guardarCuota(cuota, !id, version), 'Cuota guardada.');
  }
  async guardarPago(
    datos: DatosPago,
    id?: string,
    nuevoId?: string,
    version = id ? this.versionPago(id) : undefined,
  ): Promise<boolean> {
    const anterior = this.pagos().find((p) => p.id === id);
    if (id && (!anterior || anterior.cuotaId !== datos.cuotaId))
      return this.fallar('El pago no existe o no puede trasladarse a otra cuota.');
    if (datos.fecha > this.hoy()) return this.fallar('La fecha del pago no puede ser futura.');
    const pago = {
      ...datos,
      id: id ?? nuevoId ?? crypto.randomUUID(),
      observaciones: datos.observaciones.trim(),
    };
    const data = {
      version: 1 as const,
      cuotas: this.cuotas(),
      pagos: id ? this.pagos().map((p) => (p.id === id ? pago : p)) : [...this.pagos(), pago],
    };
    if (!this.validar(data)) return false;
    return this.mutar(() => this.repository.guardarPago(pago, !id, version), 'Pago guardado.');
  }
  async eliminarCuota(id: string, version = this.versionCuota(id)): Promise<boolean> {
    if (!this.cuotas().some((c) => c.id === id)) return this.fallar('La cuota ya no existe.');
    if (this.pagos().some((p) => p.cuotaId === id))
      return this.fallar('No se puede eliminar una cuota con pagos registrados.');
    return this.mutar(() => this.repository.eliminarCuota(id, version), 'Cuota eliminada.');
  }
  async eliminarPago(id: string, version = this.versionPago(id)): Promise<boolean> {
    if (!this.pagos().some((p) => p.id === id)) return this.fallar('El pago ya no existe.');
    return this.mutar(() => this.repository.eliminarPago(id, version), 'Pago eliminado.');
  }
  previsualizarMensual(periodo: string): Promise<VistaMensualRemota> {
    return this.repository.previsualizarMensual(periodo);
  }
  async generarMensual(vista: VistaMensualRemota): Promise<ResultadoMensual | null> {
    if (!vista.cuotas.length) {
      this.fallar('No hay cuotas nuevas para generar.');
      return null;
    }
    let resultado: ResultadoMensual | null = null;
    const token = this.auth.session()?.access_token;
    await this.mutar(
      async () => {
        resultado = await this.repository.generarMensual(vista.periodo, vista.huella);
      },
      () => {
        if (!resultado) return '';
        return (
          `${resultado.generadas} cuotas generadas, ${resultado.omitidas} omitidas y ${resultado.fallidas} fallidas.` +
          (resultado.estado === 'revertida' ? ' El lote completo fue revertido.' : '')
        );
      },
    );
    // Conservar el resultado confirmado incluso si después falla refrescar la pantalla.
    return this.auth.session()?.access_token === token ? resultado : null;
  }
  private async mutar(
    operacion: () => Promise<void>,
    mensaje: string | (() => string),
  ): Promise<boolean> {
    if (!this.disponible())
      return this.fallar('Actualizá los datos antes de operar o esperá la operación en curso.');
    const generation = this.generation;
    this.guardando.set(true);
    this.error.set('');
    this.mensaje.set('');
    let confirmada = false;
    try {
      await operacion();
      confirmada = true;
      const data = await this.repository.cargar();
      if (generation !== this.generation) return false;
      this.datos.set(data);
      this.ultimaCarga = Date.now();
      this.cargado.set(true);
      this.errorCarga.set('');
      this.mensaje.set(typeof mensaje === 'function' ? mensaje() : mensaje);
      this.toast.mostrar(this.mensaje(), typeof mensaje === 'string' ? 'exito' : 'informacion');
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      // Tras error no seguir operando con un saldo posiblemente desactualizado.
      this.datos.set(vacio());
      this.cargado.set(false);
      this.errorCarga.set('Actualizá para volver a consultar los saldos confirmados.');
      return this.fallar(
        confirmada
          ? 'La operación fue confirmada, pero no se pudo actualizar la pantalla. No la repitas: pulsá Actualizar.'
          : errorFinanciero(error),
      );
    } finally {
      this.guardando.set(false);
      if (generation !== this.generation && this.auth.session()) void this.recargar();
    }
  }
}

export function errorFinanciero(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'TCF_MENSUAL_PERIODO')
    return 'Seleccioná un período válido entre 1900 y 9999 y actualizá la vista previa.';
  if (code === 'TCF_MENSUAL_DESACTUALIZADA')
    return 'La vista previa cambió. No se generaron cuotas en este intento. Actualizala y volvé a confirmar.';
  if (code === 'TCF_MENSUAL_RPC')
    return 'La generación mensual no está disponible. Reintentá más tarde; si continúa, contactá al administrador.';
  if (code === 'TCF_MENSUAL_DATOS')
    return 'No pudimos verificar el resultado mensual. Actualizá los datos antes de continuar.';
  if (code === '42501') return 'Acceso denegado. Verificá tu sesión y autorización administrativa.';
  if (code === '23505')
    return 'Ya existe una cuota equivalente o un registro con ese ID. Actualizá antes de reintentar.';
  if (code === '23503')
    return 'El alumno o la cuota no existe, o la cuota tiene pagos. Actualizá los datos.';
  if (['TCF_CONFLICTO', '40001', '40P01', 'PGRST116'].includes(code ?? ''))
    return 'Los datos cambiaron o ya no están disponibles. Actualizá y revisá la operación antes de reintentar.';
  if (code === 'PGRST202')
    return 'La consulta de cuentas no está disponible. Reintentá más tarde; si continúa, contactá al administrador.';
  if (['P0001', '23514', '23502', '22003', '22007', '22008'].includes(code ?? ''))
    return 'No se pudo guardar: revisá saldo, importe, fechas y relaciones. Actualizá los datos antes de reintentar.';
  return 'No se pudo confirmar la operación. Revisá la conexión y actualizá antes de reintentar; no repitas un pago de resultado incierto.';
}
