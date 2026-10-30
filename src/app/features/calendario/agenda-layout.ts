import { fechaLocal, minutos, Turno } from './agenda';

export type VistaAgenda = 'dia' | 'laboral' | 'semana' | 'mes';
export const PIXELES_MINUTO = 1.6;
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}
export function diasVisibles(fecha: string, vista: VistaAgenda): string[] {
  if (vista === 'dia' || vista === 'mes') return [fecha];
  const inicio = sumarDias(fecha, -((new Date(`${fecha}T12:00:00`).getDay() + 6) % 7));
  return Array.from({ length: vista === 'laboral' ? 5 : 7 }, (_, i) => sumarDias(inicio, i));
}
export function horaTexto(minuto: number): string {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
}
export interface BloqueTurno {
  turno: Turno;
  columna: number;
  columnas: number;
  top: number;
  altura: number;
}

/** Colorea intervalos por grupo conectado: ningún par simultáneo comparte carril. */
export function distribuirTurnos(turnos: readonly Turno[], inicio = 420): BloqueTurno[] {
  const ordenados = [...turnos].sort(
    (a, b) =>
      minutos(a.inicio) - minutos(b.inicio) || b.duracion - a.duracion || a.id.localeCompare(b.id),
  );
  const resultado: BloqueTurno[] = [];
  let grupo: BloqueTurno[] = [];
  let finales: number[] = [];
  let finGrupo = -1;
  const cerrar = () => {
    grupo.forEach((b) => (b.columnas = finales.length));
    resultado.push(...grupo);
    grupo = [];
    finales = [];
  };
  for (const turno of ordenados) {
    const desde = minutos(turno.inicio);
    if (grupo.length && desde >= finGrupo) cerrar();
    let columna = finales.findIndex((fin) => fin <= desde);
    if (columna < 0) columna = finales.length;
    finales[columna] = desde + turno.duracion;
    finGrupo = Math.max(...finales);
    grupo.push({
      turno,
      columna,
      columnas: 1,
      top: (desde - inicio) * PIXELES_MINUTO,
      altura: turno.duracion * PIXELES_MINUTO,
    });
  }
  cerrar();
  return resultado;
}
