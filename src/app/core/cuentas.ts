import { ErrorUsuario } from './services/mensajes-usuario';
import type { ModalidadAlumno } from './alumno';

export interface Cuota {
  id: string;
  alumnoId: string;
  concepto: string;
  periodo: string; // YYYY-MM
  importe: number;
  vencimiento: string; // YYYY-MM-DD, fecha civil local
  observaciones: string;
}
export interface PagoCuota {
  id: string;
  cuotaId: string;
  importe: number;
  fecha: string;
  medio: 'Efectivo' | 'Transferencia' | 'Otro';
  observaciones: string;
}
export type DatosCuota = Omit<Cuota, 'id'>;
export type DatosPago = Omit<PagoCuota, 'id'>;
export type EstadoCuota = 'Pagada' | 'Pendiente' | 'Parcial' | 'Vencida';
export interface CuentasData {
  version: 1;
  cuotas: Cuota[];
  pagos: PagoCuota[];
}
export interface CuentaVista extends Cuota {
  alumno: string;
  modalidad: ModalidadAlumno;
  abonado: number;
  saldo: number;
  estado: EstadoCuota;
  pagos: PagoCuota[];
}
export const centavos = (importe: number) => Math.round(importe * 100);
export const importeValido = (n: unknown): n is number =>
  typeof n === 'number' &&
  Number.isFinite(n) &&
  n > 0 &&
  Number.isSafeInteger(centavos(n)) &&
  n <= 999999999.99 &&
  Math.abs(n * 100 - centavos(n)) < 0.00001;
export const fechaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function fechaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split('-').map(Number);
  return y >= 1900 && y <= 9999 && fechaLocal(new Date(y, m - 1, d)) === valor;
}
export const periodoValido = (valor: unknown): valor is string =>
  typeof valor === 'string' && fechaValida(`${valor}-01`);
export const normalizarConcepto = (texto: string) =>
  texto
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
/** Criterio compartido con RPC 015; el período lo aporta el reloj de Argentina. */
export function cuotasMensualesDelPeriodo<T extends Cuota>(
  cuotas: readonly T[],
  alumnoId: string,
  periodo: string,
): T[] {
  return cuotas.filter(
    (c) =>
      c.alumnoId === alumnoId &&
      c.periodo === periodo &&
      normalizarConcepto(c.concepto) === normalizarConcepto('Cuota de entrenamiento'),
  );
}
export function validarCuentas(data: unknown): asserts data is CuentasData {
  const x = data as CuentasData;
  if (!x || x.version !== 1 || !Array.isArray(x.cuotas) || !Array.isArray(x.pagos))
    throw new ErrorUsuario('Formato de cuentas inválido.');
  const ids = new Set<string>();
  const claves = new Set<string>();
  for (const c of x.cuotas) {
    if (
      !c ||
      typeof c.id !== 'string' ||
      !c.id ||
      ids.has(c.id) ||
      typeof c.alumnoId !== 'string' ||
      !c.alumnoId ||
      typeof c.concepto !== 'string' ||
      !c.concepto.trim() ||
      !periodoValido(c.periodo) ||
      !importeValido(c.importe) ||
      !fechaValida(c.vencimiento) ||
      typeof c.observaciones !== 'string'
    )
      throw new ErrorUsuario('Cuota inválida.');
    ids.add(c.id);
    const clave = JSON.stringify([c.alumnoId, normalizarConcepto(c.concepto), c.periodo]);
    if (claves.has(clave)) throw new ErrorUsuario('Hay cuotas duplicadas.');
    claves.add(clave);
  }
  const pagosIds = new Set<string>();
  const totales = new Map<string, number>();
  for (const p of x.pagos) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !p.id ||
      pagosIds.has(p.id) ||
      !ids.has(p.cuotaId) ||
      !importeValido(p.importe) ||
      !fechaValida(p.fecha) ||
      !['Efectivo', 'Transferencia', 'Otro'].includes(p.medio) ||
      typeof p.observaciones !== 'string'
    )
      throw new ErrorUsuario('Pago inválido.');
    pagosIds.add(p.id);
    totales.set(p.cuotaId, (totales.get(p.cuotaId) ?? 0) + centavos(p.importe));
  }
  for (const c of x.cuotas)
    if ((totales.get(c.id) ?? 0) > centavos(c.importe))
      throw new ErrorUsuario('Los pagos superan el importe de una cuota.');
}

export interface VistaPreviaMensual {
  periodo: string;
  cuotas: DatosCuota[];
  omitidos: { alumnoId: string; alumno: string; motivo: string }[];
}
