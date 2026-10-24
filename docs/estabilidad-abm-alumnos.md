# Estabilidad del ABM de Alumnos y primera cuota

## Hallazgos confirmados y límites

- En la revisión anterior se reprodujo un GET con HTTP 400 / PostgreSQL 42703: `column configuraciones_mensuales_1.periodo_inicio does not exist`. La consulta exigía una columna de la migración 007 que no estaba instalada. La lectura compatible de la relación con `(*)` se mantiene; no se vuelve a exigir ese campo al listar, obtener o devolver una baja/reactivación.
- En esta revisión, el usuario confirmó **HTTP 404 al crear un alumno con primera cuota**. Esa acción utiliza POST `/rest/v1/rpc/crear_alumno_con_primera_cuota` con `p_id`, `p_datos`, `p_periodo`. No se recibió el JSON técnico de esa petición autenticada: no se afirma un código PostgREST observado que no se haya proporcionado. Se contempla específicamente `PGRST202` y HTTP 404 para dar el aviso de función no disponible, conservando el mensaje original en el diagnóstico. Puede faltar la función, no coincidir su firma o estar desactualizada su caché; la consulta de catálogo propuesta permite distinguirlo.
- El formulario no ejecuta consultas de alumnos al abrirse. Utilizaba `service.error()` compartido con listado, obtención y guardado; una recarga por foco/visibilidad podía asignar un fallo de lectura durante la edición y hacerlo aparecer dentro del formulario, aunque este no hubiese guardado nada.
- El listado podía presentar registros de una carga anterior junto al error de la nueva consulta. Ahora, ante error de lectura, se oculta la tabla y se ofrece Reintentar: los registros en memoria no se presentan como una consulta exitosa.

No se utilizó la sesión del navegador ni se invocaron RPC remotas de escritura. OPTIONS de una ruta devolvió HTTP 200, pero eso no demuestra que una función esté instalada o sea ejecutable por la sesión actual. No se alteraron datos, Auth, usuarios, administradores, RLS ni permisos.

## Corrección puntual

El error y el diagnóstico del listado tienen estados independientes del guardado. Una recarga no borra el error de una operación fallida ni lo traslada al formulario. Cada diálogo conserva localmente su propio error, diagnóstico y campos; al abrirlo no hereda avisos anteriores. Sus fallos no se repiten como Toast o como error detrás del diálogo. El error de listado y el del formulario incluyen Detalles para soporte: código, mensaje, operación, recurso y HTTP cuando se conocen.

El guardado mensual básico no envía `periodoInicio` ni consulta la columna de Cron cuando no se necesita. Para una primera cuota, el mes ya viaja en `p_periodo`. El importe, día de vencimiento, habilitación y deshabilitación mantienen el contrato existente. Si se solicita guardar un inicio personalizado sin primera cuota y falta el campo, se devuelve un error específico; no se pierde silenciosamente esa elección.

La creación con primera cuota continúa en una única RPC. No hay fallback a tres escrituras ni se anuncia éxito con una respuesta fallida. El ID del alta se conserva en reintentos, el botón queda bloqueado durante el guardado y un error conserva los valores introducidos.

## SQL para revisar, sin ejecución automática

1. Revisar `database/verificar-abm-alumnos.sql`, solo lectura. Comprobar firma exacta `crear_alumno_con_primera_cuota(p_id text, p_datos jsonb, p_periodo text)` y `guardar_alumno_con_configuracion(p_id text, p_crear boolean, p_datos jsonb)`.
2. Si falta la primera RPC, revisar e instalar manualmente **`database/006-alta-primera-cuota.sql`**. Ya está preparada y probada; no hace falta duplicarla ni instalar Cron para reparar la primera cuota. Requiere esquema y 001..005 instaladas. No instalar 005 automáticamente: sus asignaciones de propietarios requieren revisión propia.
3. Si la RPC ya existe, revisar nombres de argumentos, esquema expuesto y permisos de ejecución. La implementación esperada usa SECURITY INVOKER, exige administrador autenticado y concede solamente EXECUTE a authenticated; no habilitar anon ni ampliar políticas para evitar el 404.
4. Si firma/privilegios son correctos pero PostgREST no la encuentra, solicitar aprobación para recargar su caché con `NOTIFY pgrst, 'reload schema';`. 006 ya incluye esa notificación al instalarse. Esta revisión no la ejecutó remotamente.
5. 007 sigue siendo necesaria para persistir el inicio mensual de Cron; no es requisito del listado, del ABM básico ni de la RPC 006.

No se puede declarar resuelto el 404 remoto sin instalar/verificar la RPC con revisión y aprobación. El aviso ahora identifica esa dependencia en vez de presentarla como una falla general de consulta.

## Pruebas

```text
$env:VITEST_MAX_WORKERS='2'; npm test -- --watch=false
node scripts/probar-006-postgres.mjs
npm run build -- --configuration production
```

La suite cubre listado/filtros, alta sin mensualidad, configuración habilitada/deshabilitada, alta con/sin primera cuota, recuperación de valores, duplicados, errores independientes, conservación de formulario e ID, confirmación del servidor y rechazo de primera RPC faltante sin escrituras alternativas. Dashboard, Cuotas y Centro de pendientes continúan en la suite.

PostgreSQL local verifica transacción real, vencimientos de 28/29/30/31 días, restricciones UNIQUE, cuotas/pagos previos conservados, autorización y rollback de alumno/configuración/auditoría al forzar un fallo de la cuota. No se confunde esa prueba con una operación real en Supabase.

Aceptación remota pendiente, con una sesión habitual y datos de prueba autorizados: recargar Alumnos, comprobar el GET autenticado, abrir Agregar alumno sin errores heredados, probar ambos modos mensuales y consultar la cuota creada; simular caída/restauración de red y usar Reintentar. Si falla alguna petición, copiar los Detalles para soporte sin Authorization/JWT ni datos personales. No sustituir fallos por datos antiguos ni marcar un alta como guardada antes de su confirmación.
