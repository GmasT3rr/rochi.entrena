# Corrección puntual del listado de Alumnos

El 24/10/2026 se reprodujo remotamente la consulta anterior con publishable key, sin sesión, GET y `limit=0` (sin descargar registros). Supabase devolvió HTTP **400**, código **42703**, mensaje **`column configuraciones_mensuales_1.periodo_inicio does not exist`**. La operación era SELECT sobre `alumnos`, incluyendo la relación `configuraciones_mensuales` por su FK existente.

La preparación de Cron agregó `periodo_inicio` a la selección explícita antes de instalar 007 en el servidor. La migración estaba pendiente de revisión, pero el frontend ya exigía esa columna. El servicio agrupaba 42703 con otros errores de consulta y mostraba el mensaje genérico. El Centro de pendientes utiliza otra fuente financiera y no introdujo esta consulta; el cambio causal está en `alumnos-supabase-repository.ts`.

La relación ahora solicita las columnas existentes con `(*)` y el mapper conserva `periodoInicio` si viene en la respuesta. Funciona con ambos esquemas sin exigir una migración para leer. La selección también se usa para obtener por ID y devolver la fila tras una baja/reactivación, de modo que esas operaciones estaban afectadas por la misma dependencia.

El guardado solo comprueba el campo nuevo cuando la configuración realmente lo solicita: SELECT `periodo_inicio` con límite cero, como el usuario ya autenticado y autorizado. Solo el error específico 42703 que nombra esa columna significa «campo opcional aún no instalado». Los errores de red, Auth, RLS o de otra columna se propagan con código, mensaje, operación, recurso y HTTP. No se reintenta una escritura eliminando campos tras un error.

En el esquema anterior, la configuración mensual básica se guarda con su contrato original. El período de una primera cuota sigue viajando en `p_periodo` a su única RPC atómica; no se divide en peticiones de escritura. Un período de inicio personalizado sin creación de primera cuota necesita 007 y se rechaza explícitamente si falta: no se descarta silenciosamente. La detección de disponibilidad se conserva en memoria; después de instalar 007 se debe recargar el navegador.

Las funciones nuevas de primera cuota siguen requiriendo 006; no se simula su existencia ni se introduce un fallback no atómico si falta la RPC. Esta corrección no instala Cron ni modifica sus reglas, pagos, RLS, permisos o datos.

Después del cambio, la misma comprobación remota sin sesión devuelve HTTP **401**, código **42501**, `permission denied for table alumnos`, igual que la consulta anterior al cambio de Cron. Es el rechazo esperado del rol anónimo; confirma que ya no falla al resolver la columna, pero **no equivale a probar la sesión autenticada del navegador**. No se disponía de ella y no se usaron claves privilegiadas.

Los errores de Alumnos se mantienen en la pantalla/formulario, junto con Reintentar para el listado. Se eliminó el Toast de error duplicado; se conserva el mensaje de éxito existente. `AlumnosService.detalleError()` conserva el diagnóstico técnico de la última operación fallida y se limpia al reintentar. No se convierten fallos de red o consulta en listados vacíos exitosos; se conserva la última lista confirmada. Un rechazo de autorización sigue limpiando datos como antes, sin debilitar seguridad.

Validación automatizada: repositorio con ambos esquemas, lectura/listado/ficha/baja, persistencia mensual compatible, rechazo de inicio no soportado, preservación de errores de Auth/RLS, carga de pantalla, búsqueda/filtros, alta/edición/baja con servicio real y repositorio simulado, error de red, botón Reintentar sin Toast, y reconstrucción de la vista. La suite también verifica Dashboard, Centro de pendientes y lógica financiera existente. No se efectuaron escrituras contra Supabase.

Actualización posterior: `estabilidad-abm-alumnos.md` documenta el 404 de primera cuota reportado por el usuario y la separación de errores de listado/guardado. El diagnóstico de lectura vive ahora en `detalleErrorListado()`, y los registros anteriores no se muestran mientras falla la consulta actual.

Para aceptación remota, con la sesión habitual: recargar Alumnos, verificar GET `/rest/v1/alumnos` exitoso en Network, buscar/filtrar, abrir ficha y reintentar tras cortar/restaurar la red. Las altas/ediciones/bajas deben probarse con datos desechables autorizados en un entorno de pruebas. No es necesario ejecutar SQL para recuperar el listado.
