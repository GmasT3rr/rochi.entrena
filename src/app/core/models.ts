export type Modalidad = 'Presencial' | 'Online';
export type EstadoAlumno = 'Activo' | 'En pausa';

export interface Alumno {
  id: string;
  nombre: string;
  modalidad: Modalidad;
  estado: EstadoAlumno;
  proximaCuota: Date;
}
