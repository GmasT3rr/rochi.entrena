# Cuentas y pagos en PostgreSQL

Actualización posterior: la generación mensual se implementó con vista previa y transacción PostgreSQL. Revisar [generación mensual](generacion-mensual-postgresql.md) y la migración 004 antes de usarla. Las referencias siguientes a generación deshabilitada documentan la etapa anterior.

## Aplicación manual necesaria

Revisar y ejecutar **manualmente** `docs/database/003-leer-cuentas-administrativas.sql` como postgres en el proyecto correcto. Requiere tablas, triggers y función de autorización ya instalados. No volver a ejecutar el esquema inicial ni las migraciones 001/002. La 003 se instala una vez; no modifica tablas, políticas, usuarios o datos. No se ejecutó durante el desarrollo.

Agrega `public.leer_cuentas_administrativas()` sin argumentos, STABLE, SECURITY INVOKER, search_path vacío y autorización administrativa explícita. Devuelve alumnos remotos, cuotas, pagos y sus versiones en **una única sentencia**, con arrays vacíos cuando no hay registros. Esta lectura evita mezclar un listado de cuotas previo con pagos de otra instantánea o truncar pagos embebidos por los límites de filas de Data API. RLS sigue aplicándose con los permisos del usuario.

Las escrituras son INSERT/UPDATE/DELETE sobre las tablas mediante supabase-js, cada una una operación atómica con los triggers existentes. No se agregó una RPC de escritura ni se modificó la autenticación.

## Funcionalidad migrada

- Cuotas: listado, alta para alumnos existentes en PostgreSQL, edición, detalle y eliminación de cuotas sin pagos con confirmación. Búsqueda por nombre y filtros exactos por alumno, período, estado y modalidad.
- Pagos: alta completa/parcial, varios pagos por cuota, historial, edición y eliminación confirmadas. El formulario conserva su ID de alta durante reintentos y bloquea el cierre por Escape/backdrop y el envío repetido mientras guarda.
- Ficha del alumno: saldo pendiente, próximo vencimiento, cuotas e historial mediante detalle; todo procede de PostgreSQL. Al abrir ficha/detalle se actualiza la consulta.
- Signals: cargando, guardando, disponible, error de carga, error de operación y confirmación. Un error nunca se presenta como tabla vacía. El formulario de cuotas usa el catálogo remoto del snapshot, no el servicio local ni un listado remoto aún sin cargar.
- Estados derivados en memoria: Pagada si saldo=0; Vencida si saldo>0 y vencimiento anterior al día actual; Parcial si abonó una parte; Pendiente en el resto. Los valores monetarios se suman en centavos. El día actual se obtiene explícitamente en `America/Argentina/Buenos_Aires`, aunque el navegador esté en otra zona. No se guardan estados financieros duplicados.

El Dashboard se dejó temporalmente **informativo**, sin estadísticas locales ni consultas de indicadores. La generación mensual está deshabilitada en botón, diálogo y servicio remoto. No se crean cuotas masivas ni se utiliza configuración local para hacerlo.

## Integridad, concurrencia y errores

PostgreSQL sigue siendo la fuente de verdad. Se conservaron UNIQUE por alumno/período/concepto normalizado, FK RESTRICT, dominio de importe, auditoría y triggers que impiden mover pagos/cuotas entre padres, sobrepagar o reducir un importe bajo lo abonado. El trigger de pagos escribe la revisión de la cuota para serializar operaciones financieras concurrentes.

El repositorio agrega control optimista: UPDATE/DELETE exige el timestamp `actualizado_en` leído y, para cuotas, también `revision`. La revisión se devuelve como texto para conservar bigint sin pérdida en JavaScript. No se escriben manualmente timestamps ni revisiones. Los formularios conservan la versión capturada al abrirse y la eliminación captura la versión antes de la confirmación. Si no se devuelve exactamente el ID esperado, se trata como conflicto/acceso no disponible. No se intenta trasladar una cuota a otro alumno desde el formulario.

Después de cada mutación se vuelve a leer el snapshot completo antes de mostrar éxito y publicar saldos. Si PostgreSQL rechaza, falla la red, hay conflicto o se pierde autorización, se bloquean nuevas operaciones y se exige Actualizar; no se opera sobre un saldo dudoso. No hay reintento automático de pagos, serializaciones o deadlocks. Si la escritura fue confirmada pero la lectura posterior falla, se avisa explícitamente que **ya se guardó** y no debe repetirse. Un timeout anterior a esa confirmación es de resultado incierto: actualizar antes de reintentar.

Una sesión que cambió durante la solicitud no recibe sus resultados anteriores. Se conservan los filtros durante comprobaciones de permisos y actualizaciones del mismo token; se limpian al cambiar la sesión/token. La lectura requiere administración además del guard de rutas. No se usa service_role ni user_metadata para autorizar.

No hay Realtime ni sondeo de cambios financieros externos: pulsar Actualizar, reabrir detalle/ficha o recargar para ver escrituras de otra sesión. La lectura STABLE es consistente por solicitud, no garantiza una transacción entre leer, editar en pantalla y guardar; para eso están los filtros de versión y los triggers. Dos altas con el mismo ID no hacen upsert: se rechaza el duplicado en lugar de sobrescribir. Si se cierra y abre otro formulario, se genera otro ID; no se promete idempotencia entre formularios.

## Datos locales y respaldos

No se migran, eliminan o sobrescriben datos antiguos automáticamente y no se insertan mocks en Supabase. Las pantallas activas de Alumnos y Cuentas solo consultan PostgreSQL. Los IDs y FK remotos existentes se conservan. Los registros ya existentes expresamente en Supabase se listan tal cual; no se vacían tablas.

El repositorio local anterior y `CuentasLocalesService` se conservan **exclusivamente para el archivo histórico local y sus pruebas**. `RespaldoService` continúa trabajando con ese archivo y `AlumnosLocalService`, nunca con las finanzas remotas. Configuración identifica claramente las exportaciones y restauraciones como “archivo local anterior”; no son una copia de seguridad de Supabase y no deben usarse para restaurar la base remota. Se mantienen sus claves y formatos para no perder compatibilidad. Una restauración solicitada por el usuario solo afecta ese archivo local. Dashboard y las pantallas financieras ya no lo consumen.

Faltan exportación/respaldo remoto, Dashboard y generación mensual transaccional: quedan para etapas posteriores.

## Pruebas ejecutadas y límites

Validación final: **133 tests aprobados en 11 archivos** (`npm test -- --watch=false`). Build de producción correcto (`npm run build -- --configuration production --base-href /rochi.entrena/`); continúa la advertencia existente del presupuesto inicial (786,51 kB frente a 500 kB orientativos). `git diff --check` sin errores. El CSS de tablas, formularios y toolbar con flex-wrap se conserva; la verificación visual en dispositivos reales sigue pendiente.

Se probaron con repositorio/cliente simulados: mapeo de tablas y períodos, snapshot vacío versus inválido, revisión bigint, control de versión en escrituras y filas afectadas, permisos denegados sin consultas, respuesta de otra sesión, alta/edición/baja de cuotas, pagos completos/parciales/múltiples, edición/eliminación, sobrepagos, reducción bajo lo abonado, duplicados normalizados, fecha argentina, recarga, cambio externo simulado, confirmación tardía, escritura exitosa seguida de fallo de lectura y conservación literal de las tres claves locales.

También se verifican formulario con alumnos remotos, prohibición de trasladar cuota, confirmación/cancelación de edición de pago, espera de respuesta y bloqueo de envío inválido; Dashboard sin indicadores y regresión de respaldos locales. Las pruebas antiguas de finanzas siguen apuntando explícitamente al servicio local archivado; la nueva suite prueba la implementación remota.

**No se ejecutaron CRUD reales contra Supabase ni la migración 003.** Las pruebas locales no validan los triggers instalados, RLS real, atomicidad PostgreSQL ni concurrencia de dos conexiones. El usuario informó resultados RLS satisfactorios previos, pero la nueva RPC necesita su propia validación con sesiones reales.

## Recorrido manual en un proyecto de pruebas

1. Revisar/aplicar 003. Iniciar sesión como admin. Abrir Cuentas: si no existen filas, debe mostrar estado vacío sin crear registros. Guardar antes una copia de las claves locales y comprobar al terminar que no cambiaron. Con un ID local igual a uno remoto no deben aparecer cuotas o nombres locales.
2. Con un alumno remoto existente, crear una cuota de prueba de $100, período válido y vencimiento futuro. Recargar: mismo ID y datos. Editar importe/concepto/vencimiento; confirmar que no se cambia alumno ni ID. Probar concepto equivalente con acentos, mayúsculas o espacios: el duplicado debe rechazarse.
3. Registrar $30 y $20 en pagos distintos: abonado $50, saldo $50 y estado Parcial. Agregar $50: Pagada. Reabrir ficha/detalle y recargar navegador. Comprobar IDs de cada pago, fechas, medio e historial.
4. Intentar exceder $100 o reducir la cuota por debajo de lo abonado: sin cambios. Probar también mediante API de cliente autorizado para comprobar los triggers, no solo la validación de UI.
5. Editar un pago con confirmación, cancelar otra edición y comprobar que no cambió. Eliminar un pago con confirmación y comprobar saldo. Una cuota con pagos no debe poder borrarse; tras eliminar expresamente los pagos de prueba, borrar esa cuota vacía. No probar eliminaciones con datos reales.
6. Probar estados Pendiente/Parcial/Vencida/Pagada variando vencimiento y pagos de prueba. Un pago futuro debe rechazarse también desde API. Cerca de medianoche UTC comprobar fecha actual Argentina.
7. Abrir dos sesiones administrativas autorizadas. Leer la misma cuota en ambas, modificarla desde una y guardar desde la otra con la versión anterior: conflicto, recarga obligatoria y sin sobrescritura silenciosa. Registrar pagos concurrentes que juntos excederían el saldo: PostgreSQL solo debe permitir el total válido. Repetir edición/eliminación del mismo pago y pago concurrente con reducción del importe. Pulsar Actualizar en la otra sesión y conciliar importes.
8. Sin sesión y con usuario no administrador, probar RPC 003 e INSERT/UPDATE/DELETE de cuotas/pagos mediante clientes con publishable key y JWT legítimos según corresponda. Deben denegarse sin alterar fixtures conocidos. UPDATE/DELETE con cero filas no es prueba positiva por sí solo: comprobar estado intacto desde el admin. No usar SQL Editor como evidencia de estos roles de API.
9. Bloquear red/RPC de lectura: debe mostrar error, no cuotas vacías ni saldos cero. Si falla una escritura, actualizar antes de reintentar. Simular escritura confirmada seguida de lectura fallida: aviso de operación ya guardada, sin éxito engañoso ni habilitar otro envío.
10. Verificar búsqueda, filtros, ficha, historial, responsive y que “Generación mensual” permanezca deshabilitada. Dashboard solo informa su migración pendiente. Ninguna restauración del archivo local debe cambiar PostgreSQL.

No se ejecutó SQL, se modificó RLS ni se hicieron commit, push o deploy. MFA/aal2 permanece pendiente; completar las pruebas reales y las políticas operativas antes de usar datos reales.

## Archivos principales de esta etapa

- Repositorio y Signals: `src/app/core/services/cuentas-supabase-repository.ts`, `cuentas-remotas-service.ts` y exportación `cuentas-service.ts`.
- Archivo local: `cuentas-locales-service.ts`, importaciones de `respaldo-service.ts` y pruebas locales adaptadas.
- UI: `features/cuentas/cuentas.ts/.html`, `cuenta-form.ts/.html`, `cuota-detalle.ts/.html`, `generar-mensual.ts`; ficha/listado/formulario de alumnos; Dashboard y avisos de Configuración.
- Tests nuevos: `core/services/cuentas-supabase.spec.ts`, `features/cuentas/cuenta-form.spec.ts`, `features/dashboard/dashboard.spec.ts`.
- SQL y guía: `docs/database/003-leer-cuentas-administrativas.sql`, este documento. No se tocaron tablas, RLS, triggers ni configuración de Auth.
