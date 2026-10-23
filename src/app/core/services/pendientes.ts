import { CuentaVista, centavos } from '../cuentas';
export type CategoriaPendiente = 'vencida' | 'proxima' | 'parcial' | 'pendiente';
// Categorías excluyentes: una cuota aparece una sola vez. Las vencidas tienen prioridad.
export function clasificarPendientes(cuentas: readonly CuentaVista[], hoy: string) {
  const fecha = new Date(hoy + 'T12:00:00Z');
  fecha.setUTCDate(fecha.getUTCDate() + 7);
  const limite = fecha.toISOString().slice(0, 10);
  return cuentas
    .filter((c) => centavos(c.saldo) > 0)
    .map((cuota) => ({
      cuota,
      categoria: (cuota.vencimiento < hoy
        ? 'vencida'
        : cuota.vencimiento <= limite
          ? 'proxima'
          : centavos(cuota.abonado) > 0
            ? 'parcial'
            : 'pendiente') as CategoriaPendiente,
    }))
    .sort(
      (a, b) =>
        a.cuota.vencimiento.localeCompare(b.cuota.vencimiento) ||
        a.cuota.id.localeCompare(b.cuota.id),
    );
}
