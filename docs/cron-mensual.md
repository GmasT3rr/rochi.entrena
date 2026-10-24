# Generación mensual automática — preparada, no activada remotamente

No se ejecutó SQL en Supabase. El motor se prueba con PostgreSQL embebido local, no con el scheduler real. El botón manual sigue visible hasta aprobar la validación remota. No hay secretos ni llamadas HTTP en los jobs.

## SQL para revisar e instalar

Requiere esquema original y migraciones 001..006 previamente revisadas e instaladas. No ejecutar 005 ni sus asignaciones de propietarios automáticamente.

1. `database/007-automatizacion-mensual.sql`: persiste `periodo_inicio` en configuración, adapta las RPC de guardado/alta con primera cuota y vista previa manual, y crea control deshabilitado y bitácora privados. No crea cuotas.
2. `database/008-motor-mensual-cron.sql`: motor privado transaccional, sin acceso desde clientes. No crea cuotas al instalarlo.
3. Habilitar **Integrations → Cron → pg_cron** en el Dashboard de Supabase, con aprobación. [Instalación oficial](https://supabase.com/docs/guides/cron/install).
4. `database/009-programar-cron.sql`: programa `rochy-cuotas-inicio-mes` a `5 3 1 * *` y `rochy-cuotas-reintento-diario` a `15 3 * * *`, ambos INACTIVOS. Requiere timezone UTC/GMT para Cron: 03:05 UTC equivale a 00:05 de Argentina. El motor deriva siempre el período mediante `America/Argentina/Buenos_Aires`; no usa el huso del navegador.
5. Revisar `periodo_inicio` por alumno antes de activar. El backfill usa como mínimo el mes de instalación y la fecha de ingreso, conservando un primer mes futuro identificable en las cuotas mensuales existentes. No inventa meses adeudados anteriores. Un inicio futuro que nunca se persistió en etapas anteriores no puede reconstruirse: corregirlo explícitamente desde Editar alumno antes de activar.
6. Desplegar Angular solo después de 007: la selección de alumnos ahora consulta `periodo_inicio`. Instalar sobre un entorno sin 007 provocará error de consulta; no se oculta ni se hace fallback a un guardado parcial.
7. Después de las pruebas y la aprobación correspondiente, `database/010-activar-cron.sql` habilita control y jobs en una transacción. Verifica nombres y propietario `postgres`. No genera cuotas inmediatamente; esperar los horarios o ejecutar una recuperación explícita aprobada.

Programar, activar y consultar History está documentado en [Supabase Cron Quickstart](https://supabase.com/docs/guides/cron/quickstart). Repetir `cron.schedule` con el mismo nombre reemplaza la tarea: revisar siempre comando/horario y no instalar 009 sobre una tarea productiva activa sin plan, porque la deja inactiva.

## Reglas, permisos y recuperación

El motor utiliza una transacción para todas las cuotas del intento. Solo incluye propietarios administradores activos, alumnos Activos, cobro habilitado, inicio no posterior al mes y fecha de ingreso anterior al fin de ese mes. Usa el importe actual, día individual ajustado a 28/29/30/31 y el mismo concepto/restricción UNIQUE del lote manual. Inserta dueño explícito y no impersona JWT. No actualiza ni borra cuotas/pagos. Un alta posterior al primer día entra en el reintento diario si ya corresponde su período.

La función es `SECURITY DEFINER` con dueño confiable `postgres`, `search_path` vacío y SQL estático, en esquema privado. Es privilegiada deliberadamente para procesar varios propietarios sin sesión. EXECUTE se revoca a PUBLIC, anon y authenticated; no se conceden BYPASSRLS, roles ni escrituras financieras adicionales a clientes. No se cambian políticas RLS existentes. Las dos tablas nuevas habilitan RLS sin políticas de acceso a clientes: control y bitácora solo para el operador. Revisar esta frontera privilegiada antes de aprobar el SQL.

Bloqueos transaccionales serializan automatización y usan las mismas claves por propietario/período que el lote manual. La restricción `cuotas_alumno_periodo_concepto_unique` es la garantía definitiva ante concurrencia: los conflictos se omiten sin modificar importes ni pagos existentes. Los alumnos/configuraciones se bloquean en el mismo orden que la generación manual.

Una subtransacción revierte todas las cuotas y su auditoría ante un error controlable; el registro de resultado se conserva al finalizar la función. Cada intento registra inicio/fin reales, período, origen, estado, creadas, omitidas, errores y SQLSTATE/detalle privado. `omitidas` cuenta alumnos excluidos o con cuota ya existente; `errores` indica candidatas fallidas (al menos 1 si el fallo ocurrió antes del recuento).

Un corte de conexión, cancelación, caída o timeout puede abortar toda la transacción, incluida su bitácora; PostgreSQL no ofrece una escritura autónoma dentro de la misma función. Consultar también `cron.job_run_details` para esos fallos. Un resultado financiero `error` puede acompañar un job `succeeded`, ya que la función retorna para conservar la bitácora. Comprobar AMBOS registros; no afirmar éxito por el estado del scheduler solamente.

El reintento diario recupera solo el mes actual después de una pausa temporal. Si el servicio estuvo detenido varios meses, los meses anteriores no se facturan ciegamente con importes/estados actuales: revisarlos con la administración. En Configuración → Herramientas administrativas → Revisar cuotas faltantes se reutiliza el diálogo de vista previa, confirmación y duplicados. La generación manual mantiene el aislamiento por propietario; la bitácora privada es del motor automático.

Para una recuperación actual explícita, como postgres y solo con aprobación de esa escritura:

```sql
select rochy_privado.ejecutar_mensual(clock_timestamp(), 'recuperacion');
```

Para detener la automatización, en una transacción desactivar los dos jobs mediante `cron.alter_job(jobid, active := false)` y poner `habilitada=false` en el control privado. No desinstalar pg_cron ni borrar cuotas o bitácoras. Una tarea que ya esté en curso debe terminar antes de considerar efectiva la pausa.

## Validación antes de declarar operativa la automatización

Local:

```text
node scripts/probar-cron-mensual.mjs
npm test -- --watch=false
npm run build -- --configuration production
```

El script requiere PGlite local en `tmp/aislamiento-tools`, usado por las pruebas previas. Ejecuta 001..008 en memoria, verifica límite UTC/Argentina, repetición, UNIQUE, estados, inicio futuro, altas nuevas, importes, meses, rollback, log/reintento, pagos/historia intactos, aislamiento y snapshot que consumen Cuotas y pendientes. No instala ni simula pg_cron.

Remoto, exclusivamente en un proyecto de pruebas con datos desechables aprobados:

1. Registrar conteos y copias de cuotas/pagos existentes. Revisar/aprobar 007..009 y habilitar extensión; comprobar que ambos jobs estén inactivos y no se hayan generado cuotas al instalarlos.
2. Preparar alumnos activos, pausados, inactivos, deshabilitados, sin configuración y con inicio futuro, de al menos dos propietarios autorizados. Revisar explícitamente importes y períodos de estos fixtures.
3. Con aprobación para esa prueba, habilitar el control y usar una tarea temporal de Cron con el mismo comando del motor, programada para el próximo minuto. Esperar su History real; no sustituir esta comprobación por llamar la función a mano. Eliminar luego solamente esa tarea temporal de prueba por su nombre exacto.
4. Comprobar bitácora `confirmada`, importes/días/dueños y ausencia de pagos nuevos. Repetir el job: cero duplicados; las candidatas ya creadas aparecen omitidas. Validar concurrencia con un lote manual y dos ejecuciones concurrentes en sesiones independientes.
5. Corroborar primer día real con el horario definitivo y History. Los límites de fecha y 28/29/30/31 se validan localmente mediante el reloj privado parametrizado; no pasar fechas futuras al motor en producción para hacer pruebas.
6. En el entorno desechable, ensayar rechazo de escritura/rollback y reintento, y la recuperación tras desactivar/reactivar temporalmente el job. Los fallos de infraestructura deben aparecer en History. No forzar errores en datos de negocio.
7. En Angular, verificar las cuotas del período en Cuotas y cobros y su aparición en el Centro de pendientes; registrar un pago parcial y verificar actualización sin saldos duplicados ni pérdida de filtros. Confirmar también que anon y authenticated no puedan invocar el motor privado ni leer la bitácora global.
8. Registrar fecha, jobid/runid, ID de bitácora, cantidades esperadas/obtenidas y evidencia de cada prueba. Solo después aprobar 010 para el destino definitivo. Conservar todavía el botón manual hasta completar estas pruebas reales.

Para monitorear, ejecutar `database/verificar-cron-mensual.sql` (solo lectura): jobs/horarios, History, bitácora, control y elegibles sin cuota del mes. Comparar las cantidades omitidas con los motivos y configuraciones. Mientras no existan esas evidencias remotas, la guía habla de automatización condicionada a su activación y validación.
