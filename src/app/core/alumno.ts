export type ModalidadAlumno = 'Presencial' | 'Online';
export type EstadoRegistroAlumno = 'Activo' | 'En pausa' | 'Inactivo';

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
    (a['proximaCuota'] === undefined || typeof a['proximaCuota'] === 'string')
  );
}
