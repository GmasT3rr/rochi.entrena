/** Solo textos controlados por la aplicación pueden presentarse como errores. */
export class ErrorUsuario extends Error {}
export const ERROR_DESCONOCIDO = 'Ocurrió un error. Intentá nuevamente.';
export function mensajeError(error: unknown): string {
  if (error instanceof ErrorUsuario) return error.message;
  const e = error as { code?: string; status?: number; name?: string; message?: string } | null;
  if (
    e?.status === 401 ||
    e?.status === 403 ||
    ['42501', 'TCF_AUTORIZACION', 'TCF_SESION', 'PGRST301'].includes(e?.code ?? '')
  )
    return 'No tenés permisos para realizar esta acción. Revisá tu sesión.';
  if (e?.code === '23505') return 'El registro ya existe. Actualizá los datos.';
  if (['40001', '40P01', 'TCF_CONFLICTO', 'PGRST116'].includes(e?.code ?? ''))
    return 'Los datos cambiaron. Actualizá y volvé a intentarlo.';
  if (['23514', '23502', '22023', '22003', '22007', '22008'].includes(e?.code ?? ''))
    return 'Revisá los campos marcados antes de guardar.';
  if (
    (e?.name === 'TypeError' && /failed to fetch|network|fetch failed/i.test(e.message ?? '')) ||
    e?.name === 'TimeoutError' ||
    e?.name === 'AbortError' ||
    e?.status === 0
  )
    return 'No se pudo conectar. Revisá tu conexión e intentá nuevamente.';
  return ERROR_DESCONOCIDO;
}
