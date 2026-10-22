import { importeValido } from './cuentas';
export type ModalidadAlumno = 'Presencial' | 'Online';
export type EstadoRegistroAlumno = 'Activo' | 'En pausa' | 'Inactivo';

export interface ConfiguracionMensual {
  importe: number;
  diaVencimiento: number;
  habilitada: boolean;
}
export function configuracionMensualValida(value: unknown): value is ConfiguracionMensual {
  if (!value || typeof value !== 'object') return false;
  const c = value as ConfiguracionMensual;
  return (
    importeValido(c.importe) &&
    Number.isInteger(c.diaVencimiento) &&
    c.diaVencimiento >= 1 &&
    c.diaVencimiento <= 31 &&
    typeof c.habilitada === 'boolean'
  );
}
export interface AlumnoRegistro {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  modalidad: ModalidadAlumno;
  estado: EstadoRegistroAlumno;
  fechaIngreso: string;
  observaciones: string;
  proximaCuota?: string;
  configuracionMensual?: ConfiguracionMensual;
}

export type DatosAlumno = Omit<AlumnoRegistro, 'id' | 'proximaCuota'>;

export function esAlumno(value: unknown): value is AlumnoRegistro {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    ['id', 'nombre', 'apellido', 'telefono', 'email', 'fechaIngreso', 'observaciones'].every(
      (key) => typeof a[key] === 'string',
    ) &&
    !!a['id'] &&
    !!(a['nombre'] as string).trim() &&
    !!(a['apellido'] as string).trim() &&
    ['Presencial', 'Online'].includes(a['modalidad'] as string) &&
    ['Activo', 'En pausa', 'Inactivo'].includes(a['estado'] as string) &&
    /^\d{4}-\d{2}-\d{2}$/.test(a['fechaIngreso'] as string) &&
    (a['configuracionMensual'] === undefined ||
      configuracionMensualValida(a['configuracionMensual'])) &&
    (a['proximaCuota'] === undefined || typeof a['proximaCuota'] === 'string')
  );
}
