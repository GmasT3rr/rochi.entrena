export type Modalidad = 'Presencial' | 'Online';
export type EstadoAlumno = 'Activo' | 'En pausa';
export type EstadoPago = 'Pagado' | 'Pendiente' | 'Vencido';

export interface Alumno {
  id: string;
  nombre: string;
  modalidad: Modalidad;
  estado: EstadoAlumno;
  proximaCuota: Date;
}

export interface Pago {
  id: string;
  alumno: string;
  concepto: string;
  vencimiento: Date;
  monto: number;
  estado: EstadoPago;
}

export interface ResumenDashboard {
  alumnosActivos: number;
  cuotasPendientes: number;
  recaudadoMes: number;
  proximosVencimientos: number;
}

export interface Actividad {
  id: string;
  titulo: string;
  detalle: string;
  fecha: Date;
}
