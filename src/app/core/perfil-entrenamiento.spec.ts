import {
  CAMPOS_PERFIL,
  normalizarPerfil,
  perfilVacio,
  tieneDatosPerfil,
} from './perfil-entrenamiento';
describe('Perfil de entrenamiento opcional', () => {
  it('crea un snapshot completo solo con NULL, sin datos inventados', () => {
    const datos = perfilVacio();
    expect(Object.keys(datos)).toHaveLength(17);
    expect(Object.values(datos).every((v) => v === null)).toBe(true);
    expect(tieneDatosPerfil(datos)).toBe(false);
    expect(CAMPOS_PERFIL.filter((c) => c.clave === 'tiempo_entrenando')).toHaveLength(1);
  });
  it('preserva cero y No; convierte espacios y textos vacíos a NULL', () => {
    const datos = normalizarPerfil({
      edad_declarada: 0,
      realiza_cardio: false,
      compromiso_asistencia: false,
      agua_litros_dia: 0,
      ciudad: '  ',
      objetivos: ' Meta personal ',
    });
    expect(datos.edad_declarada).toBe(0);
    expect(datos.realiza_cardio).toBe(false);
    expect(datos.ciudad).toBeNull();
    expect(datos.objetivos).toBe('Meta personal');
    expect(tieneDatosPerfil(datos)).toBe(true);
  });
  it.each([
    ['edad_declarada', 1.5],
    ['edad_declarada', -1],
    ['altura_cm', 0],
    ['peso_kg', -1],
    ['horas_sueno', 25],
    ['agua_litros_dia', 31],
    ['frecuencia_cardio_semanal', 1.5],
    ['duracion_cardio_minutos', 0],
    ['peso_kg', 70.123],
    ['altura_cm', Infinity],
    ['peso_kg', NaN],
    ['nivel_estres', 'Severo'],
    ['alimentacion', 'Excelente'],
    ['realiza_cardio', 'No'],
    ['objetivos', 'a'.repeat(3001)],
  ])('rechaza un valor inválido en %s', (campo, valor) =>
    expect(() => normalizarPerfil({ [campo]: valor })).toThrow(),
  );
  it('solo recoge los datos declarados definidos; no incorpora campos médicos', () => {
    const datos = normalizarPerfil({
      ciudad: 'Rosario',
      diagnostico: 'No importar',
      medicacion: 'No importar',
    });
    expect(datos.ciudad).toBe('Rosario');
    expect(datos).not.toHaveProperty('diagnostico');
    expect(datos).not.toHaveProperty('medicacion');
  });
});
