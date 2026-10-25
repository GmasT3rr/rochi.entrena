import { PagoCuota, fechaValida, importeValido } from './cuentas';
export interface CobroDirecto extends Omit<PagoCuota, 'cuotaId'> {
  alumnoId: string;
  concepto: string;
}
export function validarCobroDirecto(c: CobroDirecto): void {
  if (
    !c ||
    !c.id ||
    !c.alumnoId ||
    typeof c.concepto !== 'string' ||
    !c.concepto.trim() ||
    c.concepto.length > 150 ||
    !importeValido(c.importe) ||
    !fechaValida(c.fecha) ||
    !['Efectivo', 'Transferencia', 'Otro'].includes(c.medio) ||
    typeof c.observaciones !== 'string' ||
    c.observaciones.length > 3000
  )
    throw Error('Revisá alumno, concepto, importe, fecha y medio de pago.');
}
