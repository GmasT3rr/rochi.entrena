import { ErrorUsuario } from './mensajes-usuario';
export interface DiagnosticoPerfil {
  solicitud: string;
  http: number | null;
  codigo: string;
  mensaje: string;
  detalles: string | null;
}
const solicitud =
  'GET /rest/v1/perfiles_entrenamiento?select=*&alumno_id=eq.[alumno]&propietario_id=eq.[propietario]';

/** Never retain raw server errors: they may contain record values or credentials. */
export class PerfilCargaError extends ErrorUsuario {
  readonly diagnostico: DiagnosticoPerfil;
  constructor(error: { code?: string; details?: string } | null, status?: number, previa = false) {
    const codigo = error?.code && /^[A-Z0-9_]{1,40}$/i.test(error.code) ? error.code : 'TCF_RED';
    const esquema = ['PGRST205', '42P01', 'PGRST204', '42703'].includes(codigo);
    const permisos =
      ['42501', 'PGRST301', 'PGRST302', 'PGRST303', 'TCF_AUTORIZACION', 'TCF_SESION'].includes(
        codigo,
      ) ||
      status === 401 ||
      status === 403;
    super(
      esquema
        ? 'El perfil no está disponible. Intentá más tarde.'
        : permisos
          ? 'No se pudo cargar el perfil por un problema de autorización o permisos. Reintentá con una sesión válida.'
          : codigo === 'TCF_RESPUESTA'
            ? 'La respuesta del perfil no es válida. Actualizá la ficha antes de editar.'
            : 'No se pudo cargar el perfil. Revisá la conexión y reintentá.',
    );
    this.name = 'PerfilCargaError';
    const mensajes: Record<string, string> = {
      PGRST205: "Could not find the table 'public.perfiles_entrenamiento' in the schema cache",
      '42P01': 'La relación de perfiles no existe en el esquema consultado.',
      PGRST204: 'La API no reconoce una columna solicitada del perfil.',
      '42703': 'Una columna solicitada no existe.',
      '42501': 'Acceso denegado al recurso solicitado.',
      PGRST116: 'La respuesta no cumple la cardinalidad de cero o un perfil.',
      TCF_AUTORIZACION:
        'No se obtuvo autorización administrativa; no se ejecutó la consulta del perfil.',
      TCF_SESION: 'La sesión cambió durante la operación; se descartó la respuesta.',
      TCF_RESPUESTA: 'La respuesta no coincide con el alumno, propietario o contrato del perfil.',
      TCF_RED: 'No se obtuvo una respuesta válida del servidor.',
    };
    // Only a numeric cardinality is safe/useful from PostgREST details.
    const cantidad =
      codigo === 'PGRST116' ? error?.details?.match(/\b(\d+) rows?\b/)?.[1] : undefined;
    this.diagnostico = {
      solicitud: previa
        ? 'Comprobación previa: RPC /rest/v1/rpc/es_administrador_actual'
        : solicitud,
      http: status && status >= 100 && status <= 599 ? status : null,
      codigo,
      mensaje:
        mensajes[codigo] ??
        'El servidor rechazó la solicitud; se omitió el texto libre por privacidad.',
      detalles: cantidad ? `Cantidad de registros informada: ${cantidad}.` : null,
    };
  }
}
