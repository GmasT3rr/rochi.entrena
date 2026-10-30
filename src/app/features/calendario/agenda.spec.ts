import {
  AgendaMemoria,
  DatosTurno,
  fechasMes,
  fechasRepetidas,
  superpone,
  turnoValido,
} from './agenda';

const base: DatosTurno = {
  fecha: '2026-10-01',
  inicio: '09:00',
  duracion: 60,
  modalidad: 'Presencial',
  alumnoIds: ['a'],
  observaciones: '',
};
describe('Agenda de prueba en memoria', () => {
  it('respeta meses, años bisiestos y repite desde la fecha elegida sin generar meses futuros', () => {
    expect(fechasMes('2028-02')).toHaveLength(29);
    expect(fechasRepetidas('2026-10-26', [1, 3, 5])).toEqual([
      '2026-10-26',
      '2026-10-28',
      '2026-10-30',
    ]);
  });
  it('crea grupos, edita solo una ocurrencia y cancela sin borrar otras', () => {
    const repo = new AgendaMemoria();
    repo.guardar({ ...base, alumnoIds: ['a', 'b'] }, [4]);
    const [primero, segundo] = repo.listar();
    repo.guardar({ ...base, inicio: '10:00', alumnoIds: ['a', 'b'] }, [], primero.id);
    expect(repo.listar().find((t) => t.id === primero.id)?.inicio).toBe('10:00');
    expect(repo.listar().find((t) => t.id === segundo.id)?.inicio).toBe('09:00');
    repo.cancelar(primero.id);
    expect(repo.listar().find((t) => t.id === primero.id)?.estado).toBe('cancelado');
    expect(new AgendaMemoria().listar()).toEqual([]);
  });
  it('bloquea duplicados y alumnos simultáneos incluso con aceptación de superposiciones', () => {
    const repo = new AgendaMemoria();
    repo.guardar(base);
    expect(() => repo.guardar(base, [], undefined, true)).toThrow(/alumno/);
    expect(() => repo.guardar({ ...base, alumnoIds: ['b'] }, [], undefined, true)).toThrow(
      /existe/,
    );
    expect(() => repo.guardar({ ...base, inicio: '09:30' }, [], undefined, true)).toThrow(/alumno/);
    expect(repo.listar()).toHaveLength(1);
  });
  it('advierte superposiciones y solo las acepta explícitamente; permite turnos contiguos', () => {
    const repo = new AgendaMemoria();
    repo.guardar(base);
    const otro = { ...base, inicio: '09:30', alumnoIds: ['b'] };
    expect(() => repo.guardar(otro)).toThrow(/superpuestos/);
    repo.guardar(otro, [], undefined, true);
    expect(superpone(base, { ...base, inicio: '10:00' })).toBe(false);
  });
  it('rechaza datos inválidos y mantiene atómico el lote repetido', () => {
    expect(turnoValido({ ...base, fecha: '2026-02-30' })).toBe(false);
    expect(turnoValido({ ...base, inicio: '23:30' })).toBe(false);
    expect(turnoValido({ ...base, duracion: 0 })).toBe(false);
    expect(turnoValido({ ...base, alumnoIds: [] })).toBe(false);
    const repo = new AgendaMemoria();
    repo.guardar({ ...base, fecha: '2026-10-08' });
    expect(() => repo.guardar(base, [4])).toThrow();
    expect(repo.listar()).toHaveLength(1);
  });
});
