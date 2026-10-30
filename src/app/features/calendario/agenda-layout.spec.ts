import { diasVisibles, distribuirTurnos, horaTexto } from './agenda-layout';
import { Turno, superpone } from './agenda';

const turno = (id: string, inicio: string, duracion: number): Turno => ({
  id,
  inicio,
  duracion,
  fecha: '2026-10-30',
  modalidad: 'Online',
  alumnoIds: [id],
  observaciones: '',
  estado: 'programado',
});
describe('Proyección horaria de la agenda', () => {
  it('alinea semanas al lunes e incluye días de meses y años vecinos', () => {
    expect(diasVisibles('2027-01-01', 'semana')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(diasVisibles('2026-11-01', 'laboral')).toHaveLength(5);
    expect(diasVisibles('2026-11-01', 'dia')).toEqual(['2026-11-01']);
    expect(horaTexto(1440)).toBe('24:00');
  });
  it('ubica turnos a precisión de minutos, sin redondear a las celdas', () => {
    const [b] = distribuirTurnos([turno('a', '07:15', 45)]);
    expect(b.top).toBe(24);
    expect(b.altura).toBe(72);
    expect(b.columnas).toBe(1);
  });
  it('separa simultáneos, reutiliza carriles y recupera el ancho al terminar el grupo', () => {
    const entradas = [
      turno('a', '08:00', 120),
      turno('b', '08:15', 30),
      turno('c', '08:45', 60),
      turno('d', '09:00', 30),
      turno('e', '10:00', 60),
    ];
    const bloques = distribuirTurnos(entradas);
    for (const a of bloques)
      for (const b of bloques) {
        if (a !== b && superpone(a.turno, b.turno)) expect(a.columna).not.toBe(b.columna);
      }
    expect(bloques[0].columnas).toBe(3);
    expect(bloques[1].columna).toBe(bloques[2].columna);
    expect(bloques.at(-1)!.columnas).toBe(1);
    expect(entradas[0].id).toBe('a');
  });
  it('no mezcla turnos contiguos ni depende del orden de entrada', () => {
    const bloques = distribuirTurnos([turno('b', '10:00', 60), turno('a', '09:00', 60)]);
    expect(bloques.map((b) => b.turno.id)).toEqual(['a', 'b']);
    expect(bloques.every((b) => b.columnas === 1)).toBe(true);
  });
});
