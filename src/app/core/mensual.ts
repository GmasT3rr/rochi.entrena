import {
  DatosCuota,
  VistaPreviaMensual,
  fechaValida,
  importeValido,
  periodoValido,
} from './cuentas';

export interface VistaMensualRemota extends VistaPreviaMensual {
  huella: string;
  cuotas: (DatosCuota & { alumno: string })[];
}
export interface ResultadoMensual {
  periodo: string;
  estado: 'confirmada' | 'revertida';
  generadas: number;
  omitidas: number;
  fallidas: number;
  detalleOmitidos: VistaPreviaMensual['omitidos'];
}
function omitidosValidos(value: unknown): value is VistaPreviaMensual['omitidos'] {
  return (
    Array.isArray(value) &&
    value.every(
      (x) =>
        x &&
        typeof x.alumnoId === 'string' &&
        typeof x.alumno === 'string' &&
        typeof x.motivo === 'string',
    )
  );
}
export function leerVistaMensual(value: any): VistaMensualRemota {
  if (
    !value ||
    !periodoValido(value.periodo) ||
    typeof value.huella !== 'string' ||
    !/^[a-f0-9]{32}$/.test(value.huella) ||
    !omitidosValidos(value.omitidos) ||
    !Array.isArray(value.cuotas) ||
    !value.cuotas.every(
      (c: any) =>
        c &&
        typeof c.alumnoId === 'string' &&
        typeof c.alumno === 'string' &&
        c.concepto === 'Cuota de entrenamiento' &&
        c.periodo === value.periodo &&
        importeValido(c.importe) &&
        fechaValida(c.vencimiento) &&
        c.vencimiento.startsWith(value.periodo + '-') &&
        c.observaciones === '',
    )
  )
    throw { code: 'TCF_MENSUAL_DATOS' };
  const ids = [...value.cuotas, ...value.omitidos].map((x) => x.alumnoId);
  if (new Set(ids).size !== ids.length) throw { code: 'TCF_MENSUAL_DATOS' };
  return value;
}
export function leerResultadoMensual(value: any): ResultadoMensual {
  if (
    !value ||
    !periodoValido(value.periodo) ||
    !['confirmada', 'revertida'].includes(value.estado) ||
    ![value.generadas, value.omitidas, value.fallidas].every(
      (x) => Number.isSafeInteger(x) && x >= 0,
    ) ||
    !omitidosValidos(value.detalleOmitidos) ||
    value.omitidas !== value.detalleOmitidos.length ||
    (value.estado === 'confirmada' && value.fallidas !== 0) ||
    (value.estado === 'revertida' && value.generadas !== 0)
  )
    throw { code: 'TCF_MENSUAL_DATOS' };
  return value;
}
