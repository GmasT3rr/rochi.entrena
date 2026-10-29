# Documentos de alumnos — ETAPA 2

## Instalación manual

1. Revisar `docs/database/012-documentos-alumnos.sql` completo con el esquema del proyecto. Requiere aislamiento 005, la versión 005 de `auditar`, Storage con `objects.owner_id` y `objects.user_metadata`, y las migraciones previas del proyecto. No modifica las RPC financieras.
2. En un proyecto de pruebas, ejecutar **manualmente como postgres** el archivo 012 completo en el editor SQL. La transacción crea tabla, funciones, bucket y políticas. Si falla, hacer rollback y revisar; no continuar por fragmentos.
3. No crear previamente el bucket: la migración falla si ya existe, para evitar sobrescribir una configuración desconocida. El bucket `documentos-alumnos` debe permanecer privado. Confirmar en Storage que su límite sea 10.485.760 bytes y sus MIME coincidan con `rochy_privado.config_documentos()`.
4. El límite global de Storage debe permitir al menos 10 MiB. La migración no cambia ese límite ni otros buckets. Si el esquema Storage instalado difiere del revisado, integrar los cambios antes de ejecutar.
5. Validar las pruebas de integración de este documento antes de habilitarlo para uso real. No se ejecutó esta migración desde el agente ni se realizó deploy.

La migración SQL completa está en `docs/database/012-documentos-alumnos.sql`; no hay pasos de creación de políticas adicionales en el Dashboard.

## Archivos Angular

- `src/app/core/documentos-alumnos.ts`: tipos, validación de nombre/extensión/MIME/tamaño y codificación segura de alumno.
- `src/app/core/services/documentos-alumnos-repository.ts`: autorización existente, Storage, metadatos, compensación y eliminación recuperable.
- `src/app/features/alumnos/alumno-documentos.{ts,html,scss}`: pestaña, selección múltiple, tabla y tarjetas móviles, carga sin porcentajes ficticios, errores y confirmación.
- `src/app/features/alumnos/alumno-ficha.ts`: integra Documentos con carga diferida; conservar contenido al cambiar de pestaña evita recreaciones y consultas repetidas.
- `src/app/core/services/descargas-service.ts`: agrega descarga de Blob reutilizando el mecanismo existente y liberando el object URL.
- `src/app/features/guia/guia-contenido.ts`: pasos de uso, formatos, límites, descarga y eliminación.
- Pruebas: `documentos-alumnos.spec.ts`, `documentos-alumnos-repository.spec.ts`, `alumno-documentos.spec.ts` y adaptación de `alumno-ficha.spec.ts`.

## Privacidad y validación

El navegador usa la sesión de Auth y `AdminAuthorization` existentes, sin service_role. El acceso efectivo lo determina RLS. No se crean enlaces públicos ni se guardan URLs temporales. La descarga obtiene un Blob mediante `storage.download`, conserva el nombre original y revoca el object URL local.

Ruta: `propietario_uuid/alumno_id_en_hex_utf8/documento_uuid.ext`. El segmento hexadecimal conserva IDs históricos arbitrarios sin interpretar barras o escapes como carpetas. El archivo UUID es nuevo en cada carga y `upsert` está desactivado. El nombre original se guarda en SQL y en `user_metadata` de Storage para recuperar cargas interrumpidas.

RLS comprueba administrador activo, `auth.uid()`, dueño del objeto, ruta exacta y existencia del alumno bajo ese dueño. La FK compuesta evita asociar documentos con alumnos ajenos. La tabla no concede UPDATE. Storage no admite UPDATE para este bucket, aunque existan políticas permisivas amplias. La política restrictiva del bucket se aplica también a anónimos y no cambia las reglas de los demás buckets. No habilitar políticas que permitan modificar `storage.buckets` a usuarios finales ni volver público el bucket.

El bucket restringe tamaño y MIME. SQL restringe nombre/extensión, identidad/ruta y compara tamaño/MIME con los metadatos generados por Storage; no confía en el tamaño declarado por Angular. No acepta metadatos sin objeto correspondiente. El cliente valida la selección completa antes de subir, con hasta 10 archivos por operación. Ese máximo limita la selección de la interfaz, no es una cuota de documentos por alumno ni un rate limit de la API.

La fuente de configuración es `rochy_privado.config_documentos()`: Angular la recibe junto al listado. Para cambiar tamaño/MIME, modificar esa función y actualizar **en la misma transacción** `storage.buckets.file_size_limit` y `allowed_mime_types` a partir de ella, como hace 012. Los formatos nuevos también requieren ampliar los CHECK y la expresión de ruta de 012, y revisar la interfaz/guía. Para cambiar solo cantidad por selección basta cambiar `max_archivos` de esa función.

Estas comprobaciones de formato y MIME no son un antivirus ni garantizan la inocuidad del contenido de un documento. No se ejecutan ni se visualizan archivos dentro de la aplicación. No hay análisis antimalware ni inspección de macros; si se exige garantizar contenido seguro, se necesita un servicio de análisis y cuarentena antes de ofrecer descargas. El visor avanzado de Word/Excel queda para ETAPA 3.

## Consistencia y recuperación

Subida: validar → UUID/ruta → Storage → INSERT SQL → confirmación. Si SQL falla, se consulta si el INSERT quedó confirmado pese a perderse la respuesta. Si se comprueba que no existe el registro, se intenta retirar únicamente el archivo recién subido. Si la verificación o la compensación falla, se informa incertidumbre y se refresca el listado. Si Storage pierde la respuesta, tampoco se declara éxito.

La RPC de lectura devuelve tanto filas SQL como objetos del alumno sin fila SQL. Un archivo huérfano queda visible como **metadatos sin confirmar**, incluso tras cerrar y abrir la app. Se ofrece **Completar limpieza**, con confirmación; no se permite descargarlo desde la interfaz hasta que sea un documento confirmado. Luego puede adjuntarse otra vez. No hay recuperación basada únicamente en memoria o localStorage.

Eliminación: confirmar → `storage.remove([ruta])` → RPC que comprueba ausencia del objeto y elimina los metadatos. El trigger impide borrar metadatos mientras Storage aún conserve el objeto visible. No se declara éxito por un `remove` sin error si el objeto todavía figura en Storage. Si SQL falla después de retirar el archivo, el registro queda como **archivo no disponible**, con la misma acción para reintentar. La finalización es idempotente: un registro ya eliminado no impide repetirla. Nunca se elimina una carpeta completa ni se borra directamente `storage.objects` por SQL.

El listado usa un único snapshot SQL y ordena por fecha descendente, luego ID. Cambiar de alumno o sesión invalida respuestas tardías; los objetos del alumno anterior no se presentan en el nuevo. Solo la carga inicial usa MinimumLoading/Skeleton, las actualizaciones conservan la sección. Un error de carga oculta los documentos previos y permite reintentar.

Auditoría: reutiliza `rochy_privado.auditar` para INSERT/DELETE de metadatos. Conserva actor y propietario. No registra bytes ni enlaces temporales. No se alteran cuotas, pagos, cobros directos, entrenamiento, rutas ni sidebar.

## Prueba real de integración y aislamiento (pendiente de ejecutar)

Usar un proyecto de pruebas y cuentas/archivos desechables; no usar datos personales. Preparar dos administradores activos A y B con alumnos propios A1, A2 y B1, además de una cuenta sin autorización administrativa.

1. Como A, abrir A1 → Documentos. Adjuntar PDF, DOC/DOCX, XLS/XLSX, JPEG/PNG/WebP, individualmente y en selección múltiple. Confirmar listado, nombre original, MIME, tamaño y fecha. Recargar la página y verificar persistencia. Abrir A2 y verificar que no muestre documentos de A1. Volver a A1 y descargarlos, comparando sus bytes con los originales.
2. Intentar archivo vacío, >10 MiB, extensión no admitida, MIME incompatible, nombre con rutas y selección de 11 archivos. La interfaz debe rechazarlos sin subir archivos válidos de esa misma selección.
3. Probar **fuera del frontend**, con el SDK y la clave publicable más el JWT de A: `storage.from('documentos-alumnos').upload(ruta, archivo, {upsert:false,contentType:...})`. Tamaño >10 MiB y MIME no admitido deben rechazarse en Storage. Rutas con extensión ejecutable, segmentos extra o alumno inexistente deben fallar por RLS. Un INSERT SQL con tamaño/MIME falsos, nombre peligroso, propietario B o ruta de otro alumno debe fallar. Sin objeto previo, el INSERT también debe fallar.
4. Con JWT B, intentar SELECT/INSERT/DELETE en `documentos_alumnos` sobre IDs de A; llamar `listar_documentos_alumno(A1)` y `finalizar_eliminacion_documento(A1,ruta_A)`; descargar, listar, subir, borrar o sobrescribir `ruta_A` por Storage. No debe obtener ni cambiar datos de A. Una consulta filtrada puede devolver cero filas en lugar de error: comparar el estado posterior como A. Probar también propietario B con alumno A y propietario A con alumno B, y comprobar que el rechazo ocurra en servidor.
5. Repetir acceso a tabla/RPC/Storage con la clave publicable sin JWT y con la cuenta no administradora. No debe obtener archivos ni metadatos ni escribirlos. Intentar URL `/storage/v1/object/public/documentos-alumnos/<ruta>`: no debe servir el archivo. Repetir los controles pese a una política permisiva amplia en un entorno de pruebas aislado; las políticas restrictivas deben seguir bloqueando acceso cruzado y UPDATE.
6. Con A, intentar `upload(ruta_existente,...,{upsert:true})`, `update` o mover un objeto existente. No debe sobrescribirlo. El archivo original debe conservar sus bytes.
7. Forzar corte de red en cada paso mediante herramientas del navegador: después de subir pero antes de SQL; después de SQL antes de recibir respuesta; después de borrar Storage antes de finalizar SQL. Al reconectar, Actualizar documentos debe mostrar el documento confirmado o una fila de limpieza pendiente. Confirmar Completar limpieza, repetirla si falla y comprobar que no quede objeto ni fila. También se puede simular un archivo sin metadatos subiéndolo con el SDK autenticado de A a una ruta válida de prueba: debe aparecer pendiente tras recargar.
8. Eliminar un documento normal: cancelar primero (sin cambios), luego confirmar y comprobar en Storage y tabla que desapareció. Cortar permisos de la cuenta y verificar error sin Toast de éxito.
9. Navegar A1 → A2 durante una carga lenta y cambiar de cuenta durante la subida. Ninguna respuesta tardía debe mostrar documentos de la cuenta/alumno previo. Revisar pestañas, retorno al listado, filtros, teclado y anchos 320/375/768/1440 px.

Para revisar la instalación como postgres, solo lectura:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id='documentos-alumnos';
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname='public' and tablename='documentos_alumnos')
   or (schemaname='storage' and tablename='objects' and policyname like 'documentos_%');
select relrowsecurity from pg_class where oid='public.documentos_alumnos'::regclass;
```

## Verificaciones locales

Los tests del repositorio simulan SDK, errores de red, permisos y cambios de sesión. No prueban el motor RLS ni el servicio Storage. Las pruebas del componente ejercitan carga múltiple, cancelación, errores parciales, consultas tardías y descarga. La compilación de producción valida las plantillas y los tipos.

Resultado final: **356 tests aprobados en 42 archivos**, ejecutados con `npm test -- --watch=false --runner-config=tmp/vitest-documentos.config.mjs`. Esa configuración local contiene únicamente `export default { test: { maxWorkers: 2, fileParallelism: false } };`: limita concurrencia sin aumentar timeouts. Las ejecuciones finales con la concurrencia por defecto agotaron el timeout de 5 segundos en varias pruebas existentes y en la de ficha; por eso se repitió toda la suite de forma secuencial. El build de producción pasó con la advertencia existente de paquete inicial (912,52 kB frente al presupuesto de aviso de 500 kB).

Para la comprobación visual se usó Edge headless con la ficha real, los estilos globales y un repositorio ficticio local: 320, 375, 768 y 1440 px, sin conexión a Supabase. No hubo desbordamiento horizontal; se verificaron tarjetas móviles, tabla de escritorio, truncamiento de nombres y desplazamiento del foco entre pestañas con las flechas del teclado. Capturas y mediciones en `tmp/documentos-*.png` y `tmp/documentos-browser-results.json` (ignorados por Git). No se confundirá esa verificación con una subida o prueba de permisos real.

Referencias utilizadas: [acceso a Storage con RLS](https://supabase.com/docs/guides/storage/security/access-control), [límites por bucket](https://supabase.com/docs/guides/storage/uploads/file-limits) y [upload con metadatos y upsert](https://supabase.com/docs/reference/javascript/file-buckets-upload).
