# Finanzas y diagnóstico de Entrenamiento

## Evidencia real obtenida (28/10/2026)

Se consultó la API del proyecto configurado en `src/app/core/auth/supabase.config.ts` usando únicamente su clave publicable, sin JWT ni datos personales. Todas las comprobaciones de tablas usaron `limit=0`; no se descargaron filas de alumnos o perfiles y no se ejecutaron escrituras, RPC de negocio o migraciones.

Solicitud de diagnóstico:

```http
GET /rest/v1/perfiles_entrenamiento?select=alumno_id&limit=0
```

Respuesta real:

```json
{
  "http": 404,
  "code": "PGRST205",
  "message": "Could not find the table 'public.perfiles_entrenamiento' in the schema cache",
  "details": null,
  "hint": null
}
```

Control real `GET /rest/v1/alumnos?select=id&limit=0`: HTTP **401**, código **42501**, mensaje `permission denied for table alumnos`. Ese rechazo a anónimos es esperado. **No conceder permisos a anon para resolverlo**, aunque un hint genérico del servicio lo sugiera. No es el mismo error que la ausencia del recurso de perfiles en el caché.

La causa comprobada es la indisponibilidad de `public.perfiles_entrenamiento` en el esquema reconocido por la API. No se obtuvo acceso al catálogo PostgreSQL ni a una sesión administrativa del usuario: **no está demostrado si 014 nunca se aplicó o si existe una tabla aún no reflejada en el caché/API**. Tampoco se capturó la petición autenticada original del navegador del usuario. La prueba reproduce la indisponibilidad del mismo recurso, sin exponer información personal.

El código de la aplicación ya usaba `maybeSingle()`, por lo que no se encontró un uso de `single()` que convirtiera por sí mismo cero filas en error. Antes se descartaban HTTP/código del servidor y luego se sustituía cualquier fallo por el mismo texto genérico; esto impedía distinguir la causa real.

Referencia primaria: [códigos PostgREST de Supabase](https://supabase.com/docs/guides/api/rest/postgrest-error-codes), que identifica PGRST205/404 como tabla no encontrada en la URI.

## Qué comprobar manualmente y cómo resolverlo

1. En el editor SQL del **mismo proyecto**, ejecutar manualmente `docs/database/verificar-perfiles-entrenamiento.sql`. Solo lee catálogos: comprueba existencia de tabla/RPC, columnas, restricciones, RLS, políticas y privilegios, sin consultar datos de alumnos.
2. Si `tabla_perfil` devuelve NULL, revisar y aplicar manualmente la migración completa **`docs/database/014-perfiles-entrenamiento.sql`**. Requiere el aislamiento 005 y las funciones existentes de actualización y auditoría. Se revisó su contrato versionado: FK compuesta propietario/alumno, UNIQUE por dueño/alumno, 17 campos opcionales, timestamps, RLS administrativo e invocación sin `security definer`. No cambia finanzas ni Storage. Sin acceso al catálogo remoto no puede certificarse la compatibilidad con personalizaciones del proyecto: comparar primero los resultados de la verificación.
3. Si la tabla existe, **no ejecutar CREATE TABLE nuevamente**. Comparar columnas y RPC con 014, revisar permisos de authenticated y las políticas por propietario. No deshabilitar RLS ni exponer `rochy_privado`. Si el contrato está instalado pero la API sigue respondiendo PGRST205, solicitar manualmente el refresco de caché con `NOTIFY pgrst, 'reload schema';` y volver a probar la lectura autenticada.
4. Si aparece otro código, usar el diagnóstico de esa solicitud: 42501/401/403 indica rechazo de autorización/permisos; 42703/PGRST204 indica columnas; PGRST116 indica cardinalidad incorrecta y no se oculta como perfil vacío. Un error previo de autorización administrativa se identifica como tal y no se inventa un HTTP si la consulta del perfil no llegó a ejecutarse.
5. Como administrador autorizado, abrir un alumno propio y verificar consulta, edición, guardado y recarga. Probar dos propietarios y la separación entre alumnos siguiendo `perfiles-entrenamiento.md`. Estas verificaciones autenticadas reales siguen pendientes.

La migración 014 ya está entregada en el repositorio; no se creó otra migración para ocultar el fallo ni se ejecutó automáticamente. Evidencia local de la consulta real: `tmp/diagnostico-perfil-remoto.json` (sin claves, tokens o datos de alumnos; ignorado por Git). El script local de lectura no persiste ni imprime la clave publicable.

## Cambio de Entrenamiento

La consulta actual es `GET /rest/v1/perfiles_entrenamiento?select=*&alumno_id=eq.[alumno]&propietario_id=eq.[propietario]`, seguida por `maybeSingle()`. El propietario procede de la sesión verificada, no de un parámetro editable. Mantiene la autorización previa y la validación de alumno/propietario/contrato de respuesta.

- Perfil existente: muestra sus datos reales y permite editar. Un perfil existente con todos los campos NULL se distingue de una fila inexistente.
- Sin fila y sin error: “Este alumno todavía no tiene un perfil de entrenamiento.” y acción “Completar perfil”. No crea una fila automáticamente.
- Error real: mensaje correspondiente, Reintentar y detalles de soporte con HTTP, código y ruta con identificadores sustituidos por placeholders. La edición queda bloqueada. No se muestra el estado vacío para ocultar el fallo.

`PerfilCargaError` conserva solo un diagnóstico seguro. Descarta mensajes libres, hints y detalles potencialmente sensibles; presenta mensajes normalizados para códigos conocidos y, en cardinalidad, solo cantidades numéricas. No almacena ni registra tokens, emails, valores de perfil o identificadores reales en el diagnóstico. Los fallos de red o de contrato no se convierten en ausencia de perfil.

Se mantienen los campos opcionales, controles, editor, comparación de versión y manejo de respuestas tardías existentes. No se añadieron datos médicos, extracción de documentos ni cambios de autenticación/RLS.

## Presentación de Finanzas

Se reutiliza `StatCard` del Dashboard, en variante compacta, para saldo total y cantidad de cuotas con saldo. Las acciones siguen agrupadas debajo y conservan los métodos anteriores.

Cada movimiento es una tarjeta/fila compacta con concepto y badge juntos. Las cuotas agrupan período/vencimiento, importe original y saldo pendiente; Registrar pago aparece solo con saldo positivo. Los cobros directos tienen badge propio, fecha e importe recibido, sin vencimiento ni deuda. Los importes y acciones se alinean dentro del registro, sin una tabla comprimida ni truncamiento. Se preservó el orden existente por vencimiento de cuota/fecha de cobro, con desempate por clave.

No se modificaron `pendientes`, `saldoAlumno`, `movimientosVista`, reglas de pago parcial, agregación de ingresos, formularios de movimientos, navegación general ni las otras pestañas. Los estilos son locales a Finanzas; no se cambiaron z-index globales a modo de solución especulativa.

Solo se estabilizó la altura del contenedor de la ficha (`min(800px,90dvh)`), con contenido flexible y footer fuera del área desplazable. Esto mantiene el encabezado en la misma posición al cambiar entre contenido largo y estados vacíos, sin modificar el contenido de las otras pestañas.

## Pruebas

- Suite completa con concurrencia limitada, sin ampliar timeouts: `npm test -- --watch=false --runner-config=tmp/vitest-documentos.config.mjs`.
- Finanzas: cuotas parciales, vencidas, pendientes y pagadas; cobros directos sin deuda; vacío; badges; dos indicadores; apertura de detalle y registro de pago mediante los flujos existentes.
- Entrenamiento: ausencia real, perfil parcial/completo y edición mediante pruebas existentes; recarga simulada, 404/PGRST205, 403/42501, red sin HTTP, cardinalidad, sesión/propietario, no sobrescribir tras fallo y diagnósticos sin información sensible.
- Los tests de repositorio simulan el SDK: no prueban RLS, permisos o persistencia real. La llamada HTTP real descrita arriba verifica disponibilidad del recurso API, no una sesión autenticada ni el catálogo PostgreSQL.
- Edge headless con componentes reales y repositorios ficticios a 320, 375, 768 y 1440 px: múltiples estados financieros, solo cobros, vacío, perfil inexistente/parcial y errores de esquema/permisos/red. Comprobación de desbordamiento horizontal, footer y hit-test dentro del overlay. Evidencia en `tmp/finanzas-final-*.png` y `tmp/finanzas-perfil-browser-results.json`. No se reprodujo contenido de fondo por encima del modal en esta prueba; no demuestra el estado de otra sesión del navegador del usuario.
- Build de producción; se conserva la advertencia de paquete inicial.

No se ejecutaron migraciones ni cambios de datos reales, ni se hicieron commit, push o deploy.

Resultado final local: **417 tests aprobados en 47 archivos** y build de producción correcto. Se mantiene el aviso del paquete inicial (913,05 kB frente al presupuesto de aviso de 500 kB).
