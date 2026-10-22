import { AlumnoRegistro, esAlumno } from './alumno';
import { CuentasData, Cuota, PagoCuota, fechaValida, validarCuentas } from './cuentas';

export interface DatosAplicacion {
  alumnos: AlumnoRegistro[];
  cuentas: CuentasData;
}
export interface Respaldo {
  formato: 'rochy';
  version: 1;
  generadoEn: string;
  alumnos: AlumnoRegistro[];
  cuotas: Cuota[];
  pagos: PagoCuota[];
}
function campos(valor: unknown, permitidos: string[]): boolean {
  return (
    !!valor &&
    typeof valor === 'object' &&
    !Array.isArray(valor) &&
    Object.keys(valor).every((k) => permitidos.includes(k))
  );
}
export function validarDatos(datos: DatosAplicacion): void {
  if (
    !Array.isArray(datos.alumnos) ||
    !datos.alumnos.every(
      (a) =>
        esAlumno(a) &&
        fechaValida(a.fechaIngreso) &&
        (a.proximaCuota === undefined || a.proximaCuota === '' || fechaValida(a.proximaCuota)) &&
        campos(a, [
          'id',
          'nombre',
          'apellido',
          'telefono',
          'email',
          'modalidad',
          'estado',
          'fechaIngreso',
          'observaciones',
          'proximaCuota',
          'configuracionMensual',
        ]) &&
        (a.configuracionMensual === undefined ||
          campos(a.configuracionMensual, ['importe', 'diaVencimiento', 'habilitada'])),
    ) ||
    new Set(datos.alumnos.map((a) => a.id)).size !== datos.alumnos.length
  )
    throw Error('Los alumnos o sus configuraciones no son válidos.');
  validarCuentas(datos.cuentas);
  const ids = new Set(datos.alumnos.map((a) => a.id));
  if (
    datos.cuentas.cuotas.some(
      (c) =>
        !ids.has(c.alumnoId) ||
        !campos(c, [
          'id',
          'alumnoId',
          'concepto',
          'periodo',
          'importe',
          'vencimiento',
          'observaciones',
        ]),
    ) ||
    datos.cuentas.pagos.some(
      (p) => !campos(p, ['id', 'cuotaId', 'importe', 'fecha', 'medio', 'observaciones']),
    )
  )
    throw Error('Hay relaciones inválidas o campos no compatibles.');
}
export function validarRespaldo(valor: unknown): asserts valor is Respaldo {
  const r = valor as Respaldo;
  if (
    !campos(r, ['formato', 'version', 'generadoEn', 'alumnos', 'cuotas', 'pagos']) ||
    r.formato !== 'rochy' ||
    r.version !== 1 ||
    typeof r.generadoEn !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.generadoEn) ||
    !Number.isFinite(Date.parse(r.generadoEn)) ||
    new Date(r.generadoEn).toISOString() !== r.generadoEn
  )
    throw Error('El archivo no es un respaldo TusCuentasFacil compatible (versión 1).');
  validarDatos({ alumnos: r.alumnos, cuentas: { version: 1, cuotas: r.cuotas, pagos: r.pagos } });
}
// Todas las celdas se citan; el apóstrofo neutraliza fórmulas en los textos.
export function csv(filas: (string | number)[][]): string {
  return (
    '\uFEFF' +
    filas
      .map((fila) =>
        fila
          .map((valor) => {
            const texto =
              typeof valor === 'number'
                ? valor.toFixed(2).replace('.', ',')
                : /^[\s\u0000-\u001f]*[=+@\-]/u.test(valor) || /^[\t\r\n]/.test(valor)
                  ? "'" + valor
                  : valor;
            return '"' + texto.replace(/"/g, '""') + '"';
          })
          .join(';'),
      )
      .join('\r\n') +
    '\r\n'
  );
}
export const fechaExcel = (valor: string) => (valor ? valor.split('-').reverse().join('/') : '');
