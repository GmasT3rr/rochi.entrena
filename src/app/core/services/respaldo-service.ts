import { computed, inject, Injectable } from '@angular/core';
import { csv, fechaExcel, Respaldo, validarRespaldo } from '../respaldo';
import { AlumnosLocalService as AlumnosService } from './alumnos-local-service';
import { CuentasLocalesService as CuentasService } from './cuentas-locales-service';
import { DatosRepository } from './datos-repository';

export type EntidadExportable = 'alumnos' | 'cuotas' | 'pagos';

@Injectable({ providedIn: 'root' })
export class RespaldoService {
  private readonly alumnos = inject(AlumnosService);
  private readonly cuentas = inject(CuentasService);
  private readonly repository = inject(DatosRepository);
  readonly disponible = computed(() => !this.alumnos.error() && this.cuentas.disponible());

  crear(): Respaldo {
    if (!this.disponible())
      throw Error(
        'No se pudieron leer todos los datos actuales. Recargá y revisá el almacenamiento antes de exportar.',
      );
    const respaldo: Respaldo = {
      formato: 'rochy',
      version: 1,
      generadoEn: new Date().toISOString(),
      alumnos: this.alumnos.alumnos().map((a) => ({
        id: a.id,
        nombre: a.nombre,
        apellido: a.apellido,
        telefono: a.telefono,
        email: a.email,
        modalidad: a.modalidad,
        estado: a.estado,
        fechaIngreso: a.fechaIngreso,
        observaciones: a.observaciones,
        ...(a.proximaCuota === undefined ? {} : { proximaCuota: a.proximaCuota }),
        ...(a.configuracionMensual === undefined
          ? {}
          : {
              configuracionMensual: {
                habilitada: a.configuracionMensual.habilitada,
                importe: a.configuracionMensual.importe,
                diaVencimiento: a.configuracionMensual.diaVencimiento,
              },
            }),
      })),
      cuotas: this.cuentas
        .cuotas()
        .map((c) => ({
          id: c.id,
          alumnoId: c.alumnoId,
          concepto: c.concepto,
          periodo: c.periodo,
          importe: c.importe,
          vencimiento: c.vencimiento,
          observaciones: c.observaciones,
        })),
      pagos: this.cuentas
        .pagos()
        .map((p) => ({
          id: p.id,
          cuotaId: p.cuotaId,
          importe: p.importe,
          fecha: p.fecha,
          medio: p.medio,
          observaciones: p.observaciones,
        })),
    };
    validarRespaldo(respaldo);
    return respaldo;
  }

  leer(texto: string): Respaldo {
    let valor: unknown;
    try {
      valor = JSON.parse(texto.replace(/^\uFEFF/, ''));
    } catch {
      throw Error('El archivo no contiene JSON válido.');
    }
    validarRespaldo(valor);
    return valor;
  }

  restaurar(respaldo: Respaldo): void {
    // Copia independiente para que la vista previa no pueda mutar los Signals.
    const copia = this.leer(JSON.stringify(respaldo));
    const datos = {
      alumnos: copia.alumnos,
      cuentas: { version: 1 as const, cuotas: copia.cuotas, pagos: copia.pagos },
    };
    // La única operación que puede fallar ocurre antes de publicar cualquier Signal.
    this.repository.reemplazar(datos);
    this.alumnos.actualizarTrasRestauracion(datos.alumnos);
    this.cuentas.actualizarTrasRestauracion(datos.cuentas);
  }

  exportar(entidad: EntidadExportable): string {
    const r = this.crear();
    const nombres = new Map(r.alumnos.map((a) => [a.id, `${a.nombre} ${a.apellido}`]));
    if (entidad === 'alumnos')
      return csv([
        [
          'ID alumno',
          'Nombre',
          'Apellido',
          'Teléfono',
          'Email',
          'Modalidad',
          'Estado',
          'Fecha de ingreso',
          'Observaciones',
          'Cuota mensual habilitada',
          'Importe mensual (ARS)',
          'Día de vencimiento',
          'Próxima cuota registrada',
        ],
        ...r.alumnos.map((a) => [
          a.id,
          a.nombre,
          a.apellido,
          a.telefono,
          a.email,
          a.modalidad,
          a.estado,
          fechaExcel(a.fechaIngreso),
          a.observaciones,
          a.configuracionMensual?.habilitada ? 'Sí' : 'No',
          a.configuracionMensual?.importe ?? '',
          String(a.configuracionMensual?.diaVencimiento ?? ''),
          fechaExcel(a.proximaCuota ?? ''),
        ]),
      ]);
    if (entidad === 'cuotas') {
      const vistas = new Map(this.cuentas.cuentas().map((c) => [c.id, c]));
      return csv([
        [
          'ID cuota',
          'ID alumno',
          'Alumno',
          'Concepto',
          'Período',
          'Importe (ARS)',
          'Vencimiento',
          'Observaciones',
          'Abonado (ARS)',
          'Saldo (ARS)',
          'Estado',
        ],
        ...r.cuotas.map((c) => [
          c.id,
          c.alumnoId,
          nombres.get(c.alumnoId)!,
          c.concepto,
          c.periodo.split('-').reverse().join('/'),
          c.importe,
          fechaExcel(c.vencimiento),
          c.observaciones,
          vistas.get(c.id)!.abonado,
          vistas.get(c.id)!.saldo,
          vistas.get(c.id)!.estado,
        ]),
      ]);
    }
    const cuotas = new Map(r.cuotas.map((c) => [c.id, c]));
    return csv([
      [
        'ID pago',
        'ID cuota',
        'ID alumno',
        'Alumno',
        'Concepto',
        'Período',
        'Importe (ARS)',
        'Fecha de pago',
        'Medio de pago',
        'Observaciones',
      ],
      ...r.pagos.map((p) => {
        const c = cuotas.get(p.cuotaId)!;
        return [
          p.id,
          p.cuotaId,
          c.alumnoId,
          nombres.get(c.alumnoId)!,
          c.concepto,
          c.periodo.split('-').reverse().join('/'),
          p.importe,
          fechaExcel(p.fecha),
          p.medio,
          p.observaciones,
        ];
      }),
    ]);
  }
}
