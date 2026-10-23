import { Sort } from '@angular/material/sort';
export function ordenar<T>(
  filas: readonly T[],
  orden: Sort,
  valor: (fila: T, columna: string) => string | number,
): T[] {
  if (!orden.direction) return [...filas];
  const sentido = orden.direction === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = valor(a, orden.active),
      y = valor(b, orden.active);
    return (
      sentido *
      (typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), 'es', { sensitivity: 'base', numeric: true }))
    );
  });
}
