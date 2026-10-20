import { Service } from '@angular/core';
import { Actividad, Alumno, Pago, ResumenDashboard } from '../models';

@Service()
export class MockData {
  readonly resumen: ResumenDashboard = {
    alumnosActivos: 24,
    cuotasPendientes: 7,
    recaudadoMes: 485000,
    proximosVencimientos: 5,
  };

  readonly alumnos: Alumno[] = [
    { id: '1', nombre: 'Camila Duarte', modalidad: 'Presencial', estado: 'Activo', proximaCuota: new Date(2026, 9, 25) },
    { id: '2', nombre: 'Tomás Pereyra', modalidad: 'Online', estado: 'Activo', proximaCuota: new Date(2026, 9, 28) },
    { id: '3', nombre: 'Lucía Benítez', modalidad: 'Presencial', estado: 'En pausa', proximaCuota: new Date(2026, 10, 5) },
    { id: '4', nombre: 'Franco Molina', modalidad: 'Online', estado: 'Activo', proximaCuota: new Date(2026, 9, 22) },
    { id: '5', nombre: 'Martina Ríos', modalidad: 'Presencial', estado: 'Activo', proximaCuota: new Date(2026, 10, 2) },
    { id: '6', nombre: 'Nicolás Acosta', modalidad: 'Online', estado: 'Activo', proximaCuota: new Date(2026, 9, 30) },
    { id: '7', nombre: 'Valentina Sosa', modalidad: 'Presencial', estado: 'Activo', proximaCuota: new Date(2026, 10, 8) },
    { id: '8', nombre: 'Joaquín Paredes', modalidad: 'Online', estado: 'En pausa', proximaCuota: new Date(2026, 10, 12) },
  ];

  readonly pagos: Pago[] = [
    { id: 'p1', alumno: 'Camila Duarte', concepto: 'Cuota octubre', vencimiento: new Date(2026, 9, 10), monto: 45000, estado: 'Pagado' },
    { id: 'p2', alumno: 'Tomás Pereyra', concepto: 'Cuota octubre', vencimiento: new Date(2026, 9, 12), monto: 38000, estado: 'Pagado' },
    { id: 'p3', alumno: 'Franco Molina', concepto: 'Cuota octubre', vencimiento: new Date(2026, 9, 15), monto: 38000, estado: 'Pendiente' },
    { id: 'p4', alumno: 'Martina Ríos', concepto: 'Cuota octubre', vencimiento: new Date(2026, 9, 8), monto: 45000, estado: 'Vencido' },
    { id: 'p5', alumno: 'Nicolás Acosta', concepto: 'Cuota octubre', vencimiento: new Date(2026, 9, 20), monto: 38000, estado: 'Pendiente' },
    { id: 'p6', alumno: 'Valentina Sosa', concepto: 'Cuota octubre', vencimiento: new Date(2026, 9, 5), monto: 45000, estado: 'Pagado' },
    { id: 'p7', alumno: 'Lucía Benítez', concepto: 'Cuota septiembre', vencimiento: new Date(2026, 8, 28), monto: 45000, estado: 'Vencido' },
    { id: 'p8', alumno: 'Joaquín Paredes', concepto: 'Cuota octubre', vencimiento: new Date(2026, 9, 18), monto: 38000, estado: 'Pendiente' },
  ];

  readonly actividades: Actividad[] = [
    { id: 'a1', titulo: 'Pago registrado', detalle: 'Camila Duarte · Cuota octubre', fecha: new Date(2026, 9, 18, 9, 40) },
    { id: 'a2', titulo: 'Alumno dado de alta', detalle: 'Joaquín Paredes · Modalidad online', fecha: new Date(2026, 9, 17, 16, 15) },
    { id: 'a3', titulo: 'Cuota vencida', detalle: 'Martina Ríos · $ 45.000', fecha: new Date(2026, 9, 16, 8, 0) },
    { id: 'a4', titulo: 'Pago registrado', detalle: 'Valentina Sosa · Cuota octubre', fecha: new Date(2026, 9, 15, 11, 20) },
  ];
}
