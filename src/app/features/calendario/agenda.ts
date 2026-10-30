import { Injectable, signal } from '@angular/core';
import { ModalidadAlumno } from '../../core/alumno';

export interface Turno {
  version?: string;
  titulo?: string;
  id: string;
  fecha: string;
  inicio: string;
  duracion: number;
  modalidad: ModalidadAlumno;
  alumnoIds: string[];
  observaciones: string;
  estado: 'programado' | 'cancelado';
}
export type DatosTurno = Omit<Turno, 'id' | 'estado' | 'version'>;
export function fechaBuenosAires(ahora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  return ['year', 'month', 'day']
    .map((tipo) => partes.find((p) => p.type === tipo)!.value)
    .join('-');
}
export const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
/** 00:00 como finalización representa el límite del día, nunca el día siguiente. */
export function duracionHorario(inicio: string, fin: string): number {
  const horaValida = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!horaValida.test(inicio) || !horaValida.test(fin)) return NaN;
  return (fin === '00:00' ? 1440 : minutos(fin)) - minutos(inicio);
}
export function fechaLocal(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function fechasMes(periodo: string): string[] {
  const [year, month] = periodo.split('-').map(Number);
  return Array.from(
    { length: new Date(year, month, 0).getDate() },
    (_, i) => `${periodo}-${String(i + 1).padStart(2, '0')}`,
  );
}
export function fechasRepetidas(fecha: string, dias: readonly number[]): string[] {
  return fechasMes(fecha.slice(0, 7)).filter(
    (f) => f >= fecha && (f === fecha || dias.includes(new Date(`${f}T12:00:00`).getDay())),
  );
}
export function superpone(a: DatosTurno, b: DatosTurno): boolean {
  return (
    a.fecha === b.fecha &&
    minutos(a.inicio) < minutos(b.inicio) + b.duracion &&
    minutos(b.inicio) < minutos(a.inicio) + a.duracion
  );
}
export function turnoValido(t: DatosTurno): boolean {
  return (
    (t.titulo === undefined || (typeof t.titulo === 'string' && t.titulo.length <= 120)) &&
    /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(t.fecha) &&
    fechasMes(t.fecha.slice(0, 7)).includes(t.fecha) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(t.inicio) &&
    Number.isInteger(t.duracion) &&
    t.duracion > 0 &&
    minutos(t.inicio) + t.duracion <= 1440 &&
    ['Presencial', 'Online'].includes(t.modalidad) &&
    t.alumnoIds.length > 0 &&
    t.alumnoIds.every((id) => typeof id === 'string' && !!id.trim()) &&
    new Set(t.alumnoIds).size === t.alumnoIds.length
  );
}

/** Snapshot reactivo de lectura y operaciones asíncronas del adaptador remoto. */
export abstract class AgendaRepository {
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly errorListado = signal('');
  async cargar(_desde: string, _hasta: string): Promise<void> {}
  abstract listar(): readonly Turno[];
  abstract guardar(
    datos: DatosTurno,
    dias?: readonly number[],
    id?: string,
    aceptarSuperposicion?: boolean,
    version?: string,
  ): number | Promise<number>;
  abstract cancelar(id: string, version?: string): void | Promise<void>;
}

/** Fixture de pruebas exclusivamente. Calendario usa AgendaSupabase, sin fallback. */
@Injectable()
export class AgendaMemoria extends AgendaRepository {
  private readonly datos = signal<readonly Turno[]>([]);
  readonly turnos = this.datos.asReadonly();
  listar(): readonly Turno[] {
    return this.turnos();
  }
  guardar(
    datos: DatosTurno,
    dias: readonly number[] = [],
    id?: string,
    aceptarSuperposicion = false,
  ): number {
    if (!turnoValido(datos) || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      throw new Error(
        'Revisá fecha, horario, duración y alumnos. El turno debe terminar dentro del día.',
      );
    if (id && !this.turnos().some((t) => t.id === id && t.estado === 'programado'))
      throw new Error('El turno ya no está disponible.');
    if (id && dias.length) throw new Error('La edición se aplica únicamente a este turno.');
    const nuevos = (id ? [datos.fecha] : fechasRepetidas(datos.fecha, dias)).map((fecha) => ({
      ...datos,
      fecha,
      alumnoIds: [...datos.alumnoIds],
    }));
    const existentes = this.turnos().filter((t) => t.estado === 'programado' && t.id !== id);
    for (const nuevo of nuevos) {
      if (
        existentes.some(
          (t) => superpone(t, nuevo) && t.alumnoIds.some((a) => nuevo.alumnoIds.includes(a)),
        )
      )
        throw new Error(
          'Un alumno ya tiene un turno en ese horario. Editá el turno existente para formar una clase grupal.',
        );
      if (
        existentes.some(
          (t) =>
            t.fecha === nuevo.fecha &&
            t.inicio === nuevo.inicio &&
            t.duracion === nuevo.duracion &&
            t.modalidad === nuevo.modalidad,
        )
      )
        throw new Error(
          'Ya existe ese turno. Agregá alumnos editándolo para formar una clase grupal.',
        );
      if (!aceptarSuperposicion && existentes.some((t) => superpone(t, nuevo)))
        throw new Error(
          'Hay horarios superpuestos. Revisalos y confirmá la superposición para continuar.',
        );
    }
    const creados: Turno[] = nuevos.map((n) => ({
      ...n,
      id: id ?? crypto.randomUUID(),
      estado: 'programado',
    }));
    this.datos.update((ts) => [...ts.filter((t) => t.id !== id), ...creados]);
    return creados.length;
  }
  cancelar(id: string): void {
    this.datos.update((ts) => ts.map((t) => (t.id === id ? { ...t, estado: 'cancelado' } : t)));
  }
}
