import { CuentaVista } from '../../core/cuentas';
import { CobroDirecto } from '../../core/cobros-directos';
import { AlumnoFinanciero } from '../../core/services/cuentas-supabase-repository';

export type TipoMovimiento = '' | 'cuota' | 'directo';
interface MovimientoBase {
  clave: string;
  alumnoId: string;
  alumno: string;
  modalidad: string;
  concepto: string;
  periodo: string;
  fechaOrden: string;
  estado: string;
  importe: number;
  saldo: number | null;
}
export type MovimientoVista = MovimientoBase &
  (
    | { tipo: 'cuota'; etiqueta: 'Cuota'; cuota: CuentaVista; cobro?: never }
    | { tipo: 'directo'; etiqueta: 'Cobro directo'; cobro: CobroDirecto; cuota?: never }
  );

/** Adaptación de presentación: no transforma cobros en cuotas ni recalcula saldos. */
export function movimientosVista(
  cuotas: CuentaVista[],
  cobros: CobroDirecto[],
  alumnos: AlumnoFinanciero[],
): MovimientoVista[] {
  const porId = new Map(alumnos.map((a) => [a.id, a]));
  return [
    ...cuotas.map((c) => ({
      clave: `cuota:${c.id}`,
      tipo: 'cuota' as const,
      etiqueta: 'Cuota' as const,
      alumnoId: c.alumnoId,
      alumno: c.alumno,
      modalidad: c.modalidad,
      concepto: c.concepto,
      periodo: c.periodo,
      fechaOrden: c.vencimiento,
      estado: c.estado,
      importe: c.importe,
      saldo: c.saldo,
      cuota: c,
    })),
    ...cobros.map((c) => {
      const alumno = porId.get(c.alumnoId);
      return {
        clave: `directo:${c.id}`,
        tipo: 'directo' as const,
        etiqueta: 'Cobro directo' as const,
        alumnoId: c.alumnoId,
        alumno: alumno ? `${alumno.nombre} ${alumno.apellido}` : 'Alumno no disponible',
        modalidad: alumno?.modalidad ?? '',
        concepto: c.concepto,
        periodo: c.fecha.slice(0, 7),
        fechaOrden: c.fecha,
        estado: 'Cobrado',
        importe: c.importe,
        saldo: null,
        cobro: c,
      };
    }),
  ];
}
