import { Injectable } from '@angular/core';
import { AlumnoRegistro, esAlumno } from '../alumno';

export const ALUMNOS_STORAGE_KEY = 'rochy.alumnos.v1';

// Reemplazable por un repositorio HTTP cuando exista una API.
@Injectable({ providedIn: 'root' })
export class AlumnosRepository {
  cargar(): AlumnoRegistro[] | null {
    const raw = localStorage.getItem(ALUMNOS_STORAGE_KEY);
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    if (
      !Array.isArray(data) ||
      !data.every(esAlumno) ||
      new Set(data.map((a) => a.id)).size !== data.length
    ) {
      throw new Error('Los datos almacenados no tienen un formato válido.');
    }
    return data;
  }

  guardar(alumnos: readonly AlumnoRegistro[]): void {
    localStorage.setItem(ALUMNOS_STORAGE_KEY, JSON.stringify(alumnos));
  }
}
