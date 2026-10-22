# Diagnóstico de guardado y listado de Alumnos

## RPC necesaria e instalación manual

Angular utiliza estas funciones PostgreSQL:

```sql
public.es_administrador_actual() returns boolean
public.guardar_alumno_con_configuracion(p_id text, p_crear boolean, p_datos jsonb) returns jsonb
```

La primera corresponde a la migración 001, ya instalada para acceder al panel. La segunda se define en **`docs/database/002-guardar-alumno-configuracion.sql`**. Guardar recibe ID, indicador de alta/edición y un JSON con datos personales y configuración mensual. El listado no utiliza esa RPC: consulta las tablas y su relación directamente.

En Supabase, seleccionar el proyecto cuya URL está configurada en Angular. Abrir SQL Editor → New query, copiar **todo** el archivo 002, revisar y ejecutar como postgres. No ejecutar de nuevo la propuesta inicial, la migración 001 ni los scripts de fixtures. La 002 conserva RLS, utiliza SECURITY INVOKER y guarda ambas tablas en una transacción; solo concede ejecución a authenticated. No modifica credenciales ni datos existentes. El archivo instala la función una vez, no es una migración para repetir sobre una función ya creada.

PGRST202 significa que la API no encuentra la firma solicitada en su caché: puede faltar la función, existir con otros nombres de parámetros o estar pendiente la recarga. No demuestra por sí solo que falte físicamente en PostgreSQL. La migración termina con NOTIFY para refrescar el esquema.

Consultas manuales de diagnóstico de solo lectura, si necesitás comprobar el estado instalado:

```sql
select to_regprocedure('public.es_administrador_actual()') as autorizacion,
       to_regprocedure('public.guardar_alumno_con_configuracion(text,boolean,jsonb)') as guardado;

select p.proname, p.proargnames, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_ejecuta,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ejecuta
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'guardar_alumno_con_configuracion';
```

Esperado: función existente, argumentos `p_id,p_crear,p_datos`, prosecdef=false, authenticated=true, anon=false. Si ya existe con esa firma y la API no la ve, el operador puede ejecutar manualmente:

```sql
notify pgrst, 'reload schema';
```

No se ejecutó ninguna de estas sentencias durante esta revisión.

## Listado: problema confirmado y límites del diagnóstico

Se confirmó un defecto de estado en Angular: el error de guardado y el del listado compartían `service.error`. Si el listado vacío había cargado bien y luego fallaba el guardado por RPC faltante, el template mostraba “Listado no disponible” por ese error de escritura. **Esto no demuestra que haya fallado el SELECT.** Se agregó un estado independiente `errorListado` y el listado solo muestra ese fallo cuando su propia consulta falla.

La consulta selecciona los datos de `alumnos` y embebe `configuraciones_mensuales` mediante la FK por alumno_id. No depende de instalar 002. El esquema local contiene esa relación y concede SELECT a authenticated con RLS administrativa; no se verificaron los grants/FK realmente instalados mediante una sesión remota en esta revisión. No se recomienda cambiar políticas basándose en el mensaje genérico.

También se corrigió la paginación: solicita count exact y termina al alcanzar el total visible, sin hacer una solicitud extra fuera del conjunto. Se conserva la paginación si el servidor limita cada respuesta. Los errores del servidor no se convierten en un resultado vacío; un conteo ausente o respuesta inesperada es un error explícito. [Referencia de paginación](https://supabase.com/docs/reference/javascript/using-modifiers-range).

Si la lectura sigue fallando, iniciar sesión como administrador y abrir DevTools → Network → solicitud `alumnos` al pulsar Actualizar. Registrar únicamente HTTP status y código del JSON de error, nunca headers, JWT o contraseñas:

- PGRST200: relación/FK no encontrada en caché; revisar la FK real, no deshabilitar RLS.
- PGRST201: relaciones ambiguas; revisar la relación instalada antes de especificar su nombre.
- 42703: columna ausente; comparar nombres con el esquema instalado, especialmente `proxima_cuota_original`, `fecha_ingreso` y `dia_vencimiento`.
- PGRST205 / 42P01: tabla ausente o no encontrada en caché.
- 42501: permisos/sesión/autorización. Comprobar RPC administrativa true y los grants/RLS instalados. No abrir acceso a anon.
- PGRST103 / HTTP 416: rango de paginación rechazado. La corrección evita pedir una página posterior al total conocido; ante cambios concurrentes sigue mostrándose un error, no se oculta como vacío.
- Error de conexión/timeout: reintentar tras recuperar red; sin fallback local.

La causa de cualquier SELECT remoto adicional queda pendiente de su respuesta concreta. La falta de RPC de guardado por sí sola no explica un error de SELECT independiente.

Después de instalar 002, pulsar Actualizar, crear un alumno de prueba con configuración mensual, editarlo/deshabilitar configuración y recargar. Verificar ambas filas e ID conservado. No se insertaron mocks, no se volvió a localStorage y no se modificaron políticas de seguridad.
