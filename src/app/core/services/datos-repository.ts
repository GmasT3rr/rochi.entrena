import { Injectable } from '@angular/core';
import { DatosAplicacion, validarDatos } from '../respaldo';
export const DATOS_STORAGE_KEY = 'rochy.datos.v1';

// Una sola escritura atómica evita restauraciones parciales entre alumnos y cuentas.
@Injectable({ providedIn: 'root' })
export class DatosRepository {
  cargar(): DatosAplicacion | null {
    const raw = localStorage.getItem(DATOS_STORAGE_KEY);
    if (raw === null) return null;
    const datos: DatosAplicacion = JSON.parse(raw);
    if (!datos || typeof datos !== 'object') throw Error('Datos restaurados inválidos.');
    validarDatos(datos);
    return datos;
  }
  reemplazar(datos: DatosAplicacion): void {
    validarDatos(datos);
    localStorage.setItem(DATOS_STORAGE_KEY, JSON.stringify(datos));
  }
}
