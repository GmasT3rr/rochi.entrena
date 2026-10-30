import { ErrorUsuario, mensajeError } from './mensajes-usuario';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  VistaPreviaMensual,
  periodoValido,
  CuentasData,
  CuentaVista,
  DatosCuota,
  DatosPago,
  centavos,
  fechaLocal,
  normalizarConcepto,
  validarCuentas,
} from '../cuentas';
import { AlumnosLocalService as AlumnosService } from './alumnos-local-service';
import { CuentasRepository } from './cuentas-repository';

@Injectable({ providedIn: 'root' })
export class CuentasLocalesService {
  private readonly alumnos = inject(AlumnosService);
  private readonly repository = inject(CuentasRepository);
  private readonly datos = signal<CuentasData>({ version: 1, cuotas: [], pagos: [] });
  readonly hoy = signal(fechaLocal());
  readonly error = signal('');
  readonly mensaje = signal('');
  readonly disponible = signal(true);
  readonly cuotas = computed(() => this.datos().cuotas);
  readonly pagos = computed(() => this.datos().pagos);
  readonly cuentas = computed<CuentaVista[]>(() =>
    this.cuotas().map((c) => {
      const a = this.alumnos.alumnos().find((a) => a.id === c.alumnoId)!;
      const pagos = this.pagos()
        .filter((p) => p.cuotaId === c.id)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      const total = pagos.reduce((n, p) => n + centavos(p.importe), 0);
      const saldo = centavos(c.importe) - total;
      return {
        ...c,
        alumno: a ? `${a.nombre} ${a.apellido}` : 'Alumno no disponible',
        modalidad: a?.modalidad ?? 'Presencial',
        pagos,
        abonado: total / 100,
        saldo: saldo / 100,
        estado:
          saldo === 0
            ? 'Pagada'
            : c.vencimiento < this.hoy()
              ? 'Vencida'
              : total > 0
                ? 'Parcial'
                : 'Pendiente',
      };
    }),
  );
  readonly pendientes = computed(() => this.cuentas().filter((c) => c.saldo > 0));
  readonly proximos = computed(() => {
    const [y, m, d] = this.hoy().split('-').map(Number);
    const limite = fechaLocal(new Date(y, m - 1, d + 7));
    return this.pendientes().filter((c) => c.vencimiento >= this.hoy() && c.vencimiento <= limite);
  });
  readonly ingresosMes = computed(
    () =>
      this.pagos()
        .filter((p) => p.fecha.slice(0, 7) === this.hoy().slice(0, 7))
        .reduce((n, p) => n + centavos(p.importe), 0) / 100,
  );
  readonly cobros = computed(() =>
    [...this.pendientes()].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento)).slice(0, 4),
  );

  constructor() {
    const timer = setInterval(() => this.hoy.set(fechaLocal()), 30000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    try {
      if (this.alumnos.error()) throw new ErrorUsuario('No se pueden leer los alumnos.');
      let data = this.repository.cargar();
      if (data === null) {
        data = { version: 1, cuotas: [], pagos: [] };
        this.repository.guardar(data);
      }
      this.validarRelaciones(data);
      this.datos.set(data);
    } catch {
      this.disponible.set(false);
      this.error.set(
        'No se pudieron cargar las cuentas guardadas. Revisá el almacenamiento y recargá. No se sobrescribieron los datos existentes.',
      );
    }
  }

  previsualizarMensual(periodo: string): VistaPreviaMensual {
    if (!periodoValido(periodo))
      throw new ErrorUsuario('Seleccioná un mes y año válidos (1900 a 9999).');
    const vista: VistaPreviaMensual = { periodo, cuotas: [], omitidos: [] };
    const [anio, mes] = periodo.split('-').map(Number);
    const ultimoDia = new Date(anio, mes, 0).getDate();
    for (const a of this.alumnos.alumnos()) {
      const config = a.configuracionMensual;
      const motivo =
        a.estado !== 'Activo'
          ? 'Alumno inactivo o en pausa'
          : !config
            ? 'Sin configuración mensual'
            : !config.habilitada
              ? 'Generación mensual deshabilitada'
              : this.cuotas().some(
                    (c) =>
                      c.alumnoId === a.id &&
                      c.periodo === periodo &&
                      normalizarConcepto(c.concepto) ===
                        normalizarConcepto('Cuota de entrenamiento'),
                  )
                ? 'Ya existe la cuota del período'
                : '';
      if (motivo)
        vista.omitidos.push({ alumnoId: a.id, alumno: a.nombre + ' ' + a.apellido, motivo });
      else if (config)
        vista.cuotas.push({
          alumnoId: a.id,
          concepto: 'Cuota de entrenamiento',
          periodo,
          importe: config.importe,
          vencimiento:
            periodo + '-' + String(Math.min(config.diaVencimiento, ultimoDia)).padStart(2, '0'),
          observaciones: '',
        });
    }
    return vista;
  }

  generarMensual(vista: VistaPreviaMensual): boolean {
    let actual: VistaPreviaMensual;
    try {
      actual = this.previsualizarMensual(vista.periodo);
    } catch {
      return this.fallar('El período no es válido.');
    }
    if (JSON.stringify(actual) !== JSON.stringify(vista))
      return this.fallar('Los datos cambiaron. Actualizá la vista previa antes de confirmar.');
    if (!actual.cuotas.length) return this.fallar('No hay cuotas nuevas para generar.');
    return this.persistir(
      {
        ...this.datos(),
        cuotas: [
          ...this.cuotas(),
          ...actual.cuotas.map((c) => ({ ...c, id: crypto.randomUUID() })),
        ],
      },
      actual.cuotas.length + ' cuotas creadas. ' + actual.omitidos.length + ' alumnos omitidos.',
    );
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
  guardarCuota(datos: DatosCuota, id?: string): boolean {
    const anterior = this.cuotas().find((c) => c.id === id);
    if (id && !anterior) return this.fallar('La cuota ya no existe.');
    const cuota = {
      alumnoId: datos.alumnoId,
      periodo: datos.periodo,
      importe: datos.importe,
      vencimiento: datos.vencimiento,
      concepto: datos.concepto.trim().replace(/\s+/g, ' '),
      observaciones: datos.observaciones.trim(),
      id: id ?? crypto.randomUUID(),
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
    const abonado = this.pagos()
      .filter((p) => p.cuotaId === id)
      .reduce((n, p) => n + centavos(p.importe), 0);
    if (centavos(cuota.importe) < abonado)
      return this.fallar('El importe no puede ser menor al total ya abonado.');
    return this.persistir(
      {
        ...this.datos(),
        cuotas: id
          ? this.cuotas().map((c) => (c.id === id ? cuota : c))
          : [...this.cuotas(), cuota],
      },
      'Cuota guardada.',
    );
  }
  eliminarCuota(id: string): boolean {
    if (!this.cuotas().some((c) => c.id === id)) return this.fallar('La cuota ya no existe.');
    if (this.pagos().some((p) => p.cuotaId === id))
      return this.fallar('No se puede eliminar una cuota con pagos registrados.');
    return this.persistir(
      { ...this.datos(), cuotas: this.cuotas().filter((c) => c.id !== id) },
      'Cuota eliminada.',
    );
  }
  guardarPago(datos: DatosPago, id?: string): boolean {
    const cuota = this.cuotas().find((c) => c.id === datos.cuotaId);
    const anterior = this.pagos().find((p) => p.id === id);
    if (!cuota || (id && (!anterior || anterior.cuotaId !== datos.cuotaId)))
      return this.fallar('No se encontró la cuota o el pago.');
    const otros = this.pagos()
      .filter((p) => p.cuotaId === cuota.id && p.id !== id)
      .reduce((n, p) => n + centavos(p.importe), 0);
    if (centavos(datos.importe) + otros > centavos(cuota.importe))
      return this.fallar('El pago supera el saldo disponible.');
    if (datos.fecha > this.hoy()) return this.fallar('La fecha del pago no puede ser futura.');
    const pago = {
      cuotaId: datos.cuotaId,
      fecha: datos.fecha,
      medio: datos.medio,
      importe: datos.importe,
      observaciones: datos.observaciones.trim(),
      id: id ?? crypto.randomUUID(),
    };
    return this.persistir(
      {
        ...this.datos(),
        pagos: id ? this.pagos().map((p) => (p.id === id ? pago : p)) : [...this.pagos(), pago],
      },
      'Pago guardado.',
    );
  }
  eliminarPago(id: string): boolean {
    if (!this.pagos().some((p) => p.id === id)) return this.fallar('El pago ya no existe.');
    return this.persistir(
      { ...this.datos(), pagos: this.pagos().filter((p) => p.id !== id) },
      'Pago eliminado.',
    );
  }
  private fallar(error: string): false {
    this.error.set(error);
    return false;
  }

  actualizarTrasRestauracion(datos: CuentasData): void {
    this.datos.set(datos);
    this.disponible.set(true);
    this.error.set('');
    this.mensaje.set('');
  }
  private validarRelaciones(data: CuentasData): void {
    validarCuentas(data);
    if (data.cuotas.some((c) => !this.alumnos.alumnos().some((a) => a.id === c.alumnoId)))
      throw new ErrorUsuario('Hay cuotas sin alumno.');
  }
  private persistir(data: CuentasData, mensaje: string): boolean {
    if (!this.disponible()) return false;
    try {
      this.validarRelaciones(data);
    } catch (e) {
      return this.fallar(mensajeError(e));
    }
    try {
      this.repository.guardar(data);
      this.datos.set(data);
      this.error.set('');
      this.mensaje.set(mensaje);
      return true;
    } catch {
      return this.fallar(
        'No se pudo guardar. Revisá el espacio y los permisos del navegador. Tus cambios no se aplicaron.',
      );
    }
  }
}
