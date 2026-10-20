import { Injectable } from '@angular/core';
import { CuentasData, validarCuentas } from '../cuentas';
export const CUENTAS_STORAGE_KEY = 'rochy.cuentas.v1';

// Un único documento permite escribir cuotas y pagos de forma atómica.
// La UI no depende de localStorage: este repositorio se puede reemplazar por HTTP.
@Injectable({ providedIn: 'root' })
export class CuentasRepository {
  cargar(): CuentasData | null {
    const raw = localStorage.getItem(CUENTAS_STORAGE_KEY);
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    validarCuentas(data);
    return data;
  }
  guardar(data: CuentasData): void {
    validarCuentas(data);
    localStorage.setItem(CUENTAS_STORAGE_KEY, JSON.stringify(data));
  }
}
