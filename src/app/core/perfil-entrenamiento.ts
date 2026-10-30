import { ErrorUsuario } from './services/mensajes-usuario';
export interface DatosPerfilEntrenamiento {
  edad_declarada: number | null;
  altura_cm: number | null;
  peso_kg: number | null;
  ciudad: string | null;
  tiempo_entrenando: string | null;
  realiza_cardio: boolean | null;
  tipo_cardio: string | null;
  frecuencia_cardio_semanal: number | null;
  duracion_cardio_minutos: number | null;
  agua_litros_dia: number | null;
  alimentacion: string | null;
  actividad_laboral: string | null;
  horas_sueno: number | null;
  nivel_estres: string | null;
  disponibilidad: string | null;
  objetivos: string | null;
  compromiso_asistencia: boolean | null;
}
export interface PerfilEntrenamiento extends DatosPerfilEntrenamiento {
  id: string;
  propietario_id: string;
  alumno_id: string;
  creado_en: string;
  actualizado_en: string;
}
export interface CampoPerfil {
  clave: keyof DatosPerfilEntrenamiento;
  label: string;
  tipo: 'numero' | 'texto' | 'area' | 'selector' | 'booleano';
  min?: number;
  max?: number;
  paso?: number;
  longitud?: number;
  opciones?: readonly string[];
  unidad?: string;
}
export const SECCIONES_PERFIL: readonly { titulo: string; campos: readonly CampoPerfil[] }[] = [
  {
    titulo: 'Datos físicos',
    campos: [
      {
        clave: 'edad_declarada',
        label: 'Edad declarada al completar la ficha',
        tipo: 'numero',
        min: 0,
        max: 130,
        paso: 1,
        unidad: 'años',
      },
      {
        clave: 'altura_cm',
        label: 'Altura',
        tipo: 'numero',
        min: 1,
        max: 300,
        paso: 0.01,
        unidad: 'cm',
      },
      {
        clave: 'peso_kg',
        label: 'Peso actual declarado',
        tipo: 'numero',
        min: 0.01,
        max: 1000,
        paso: 0.01,
        unidad: 'kg',
      },
      { clave: 'ciudad', label: 'Ciudad de residencia', tipo: 'texto', longitud: 150 },
    ],
  },
  {
    titulo: 'Experiencia y actividad',
    campos: [
      {
        clave: 'tiempo_entrenando',
        label: 'Tiempo que lleva entrenando',
        tipo: 'texto',
        longitud: 300,
      },
      { clave: 'realiza_cardio', label: 'Realiza actividad cardiovascular', tipo: 'booleano' },
      { clave: 'tipo_cardio', label: 'Tipo de cardio', tipo: 'texto', longitud: 300 },
      {
        clave: 'frecuencia_cardio_semanal',
        label: 'Sesiones de cardio por semana',
        tipo: 'numero',
        min: 0,
        max: 100,
        paso: 1,
      },
      {
        clave: 'duracion_cardio_minutos',
        label: 'Duración aproximada por sesión',
        tipo: 'numero',
        min: 1,
        max: 1440,
        paso: 1,
        unidad: 'minutos',
      },
    ],
  },
  {
    titulo: 'Hábitos',
    campos: [
      {
        clave: 'agua_litros_dia',
        label: 'Consumo aproximado de agua por día',
        tipo: 'numero',
        min: 0,
        max: 30,
        paso: 0.01,
        unidad: 'litros',
      },
      {
        clave: 'alimentacion',
        label: 'Calidad de alimentación declarada',
        tipo: 'selector',
        opciones: ['Baja', 'Regular', 'Buena', 'Muy buena'],
      },
      {
        clave: 'actividad_laboral',
        label: 'Tipo de actividad laboral',
        tipo: 'texto',
        longitud: 500,
      },
      {
        clave: 'horas_sueno',
        label: 'Horas de sueño diarias',
        tipo: 'numero',
        min: 0,
        max: 24,
        paso: 0.01,
        unidad: 'horas',
      },
      {
        clave: 'nivel_estres',
        label: 'Nivel de estrés percibido',
        tipo: 'selector',
        opciones: ['Bajo', 'Medio', 'Alto'],
      },
    ],
  },
  {
    titulo: 'Organización',
    campos: [
      {
        clave: 'disponibilidad',
        label: 'Días y horarios disponibles para entrenar',
        tipo: 'area',
        longitud: 1500,
      },
    ],
  },
  {
    titulo: 'Objetivos',
    campos: [
      {
        clave: 'objetivos',
        label: 'Objetivos personales del entrenamiento',
        tipo: 'area',
        longitud: 3000,
      },
      {
        clave: 'compromiso_asistencia',
        label: 'Compromiso de asistencia regular',
        tipo: 'booleano',
      },
    ],
  },
];
export const CAMPOS_PERFIL = SECCIONES_PERFIL.flatMap((s) => s.campos);
export function normalizarPerfil(datos: Record<string, unknown>): DatosPerfilEntrenamiento {
  const limpio = Object.fromEntries(
    CAMPOS_PERFIL.map((c) => {
      const valor = datos[c.clave];
      return [c.clave, typeof valor === 'string' ? valor.trim() || null : (valor ?? null)];
    }),
  ) as unknown as DatosPerfilEntrenamiento;
  for (const c of CAMPOS_PERFIL) {
    const v = limpio[c.clave];
    if (v === null) continue;
    const valido =
      c.tipo === 'numero'
        ? typeof v === 'number' &&
          Number.isFinite(v) &&
          v >= c.min! &&
          v <= c.max! &&
          (c.paso === 1 ? Number.isInteger(v) : Math.abs(v * 100 - Math.round(v * 100)) < 0.000001)
        : c.tipo === 'booleano'
          ? typeof v === 'boolean'
          : typeof v === 'string' &&
            (c.tipo === 'selector' ? c.opciones!.includes(v) : v.length <= c.longitud!);
    if (!valido) throw new ErrorUsuario(`Revisá el campo: ${c.label}.`);
  }
  return limpio;
}
export const perfilVacio = () => normalizarPerfil({});
export const tieneDatosPerfil = (datos: DatosPerfilEntrenamiento) =>
  CAMPOS_PERFIL.some((c) => datos[c.clave] !== null);
