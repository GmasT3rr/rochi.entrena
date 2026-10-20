import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  CuentasData,
  CuentaVista,
  DatosCuota,
  DatosPago,
  centavos,
  fechaLocal,
  normalizarConcepto,
  validarCuentas,
} from '../cuentas';
import { AlumnosService } from './alumnos-service';
import { CuentasRepository } from './cuentas-repository';

@Injectable({ providedIn: 'root' })
export class CuentasService {
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
      if (this.alumnos.error()) throw Error('No se pueden leer los alumnos.');
      let data = this.repository.cargar();
      if (data === null) {
        const [y, m, d] = this.hoy().split('-').map(Number);
        const cuotas = this.alumnos
          .alumnos()
          .slice(0, 3)
          .map((a, i) => ({
            id: crypto.randomUUID(),
            alumnoId: a.id,
            concepto: 'Cuota de entrenamiento',
            periodo: this.hoy().slice(0, 7),
            importe: 50000,
            vencimiento: fechaLocal(new Date(y, m - 1, d + (i === 0 ? -3 : i === 1 ? 3 : 7))),
            observaciones: 'Cuota de demostración',
          }));
        data = {
          version: 1,
          cuotas,
          pagos: cuotas.slice(0, 2).map((c, i) => ({
            id: crypto.randomUUID(),
            cuotaId: c.id,
            importe: i === 0 ? 30000 : 50000,
            fecha: this.hoy(),
            medio: 'Transferencia',
            observaciones: 'Pago de demostración',
          })),
        };
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
  private validarRelaciones(data: CuentasData): void {
    validarCuentas(data);
    if (data.cuotas.some((c) => !this.alumnos.alumnos().some((a) => a.id === c.alumnoId)))
      throw Error('Hay cuotas sin alumno.');
  }
  private persistir(data: CuentasData, mensaje: string): boolean {
    if (!this.disponible()) return false;
    try {
      this.validarRelaciones(data);
    } catch (e) {
      return this.fallar(e instanceof Error ? e.message : 'Datos inválidos.');
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
