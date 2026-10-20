import { Service } from '@angular/core';
import { Alumno } from '../models';

@Service()
export class MockData {
  readonly alumnos: Alumno[] = [
    {
      id: '1',
      nombre: 'Camila Duarte',
      modalidad: 'Presencial',
      estado: 'Activo',
      proximaCuota: new Date(2026, 9, 25),
    },
    {
      id: '2',
      nombre: 'Tomás Pereyra',
      modalidad: 'Online',
      estado: 'Activo',
      proximaCuota: new Date(2026, 9, 28),
    },
    {
      id: '3',
      nombre: 'Lucía Benítez',
      modalidad: 'Presencial',
      estado: 'En pausa',
      proximaCuota: new Date(2026, 10, 5),
    },
    {
      id: '4',
      nombre: 'Franco Molina',
      modalidad: 'Online',
      estado: 'Activo',
      proximaCuota: new Date(2026, 9, 22),
    },
    {
      id: '5',
      nombre: 'Martina Ríos',
      modalidad: 'Presencial',
      estado: 'Activo',
      proximaCuota: new Date(2026, 10, 2),
    },
    {
      id: '6',
      nombre: 'Nicolás Acosta',
      modalidad: 'Online',
      estado: 'Activo',
      proximaCuota: new Date(2026, 9, 30),
    },
    {
      id: '7',
      nombre: 'Valentina Sosa',
      modalidad: 'Presencial',
      estado: 'Activo',
      proximaCuota: new Date(2026, 10, 8),
    },
    {
      id: '8',
      nombre: 'Joaquín Paredes',
      modalidad: 'Online',
      estado: 'En pausa',
      proximaCuota: new Date(2026, 10, 12),
    },
  ];
}
