# Generación mensual en PostgreSQL

## SQL que revisar y aplicar manualmente

`docs/database/004-generacion-mensual.sql` agrega:

```sql
public.previsualizar_cuotas_mensuales(p_periodo text) returns jsonb
public.generar_cuotas_mensuales(p_periodo text, p_huella text) returns jsonb
```

Revisar el archivo completo y ejecutarlo una sola vez como postgres en el proyecto correcto. Requiere el esquema, constraints, triggers y autorización existentes; la recarga financiera sigue usando la RPC 003 ya instalada. No repetir las migraciones anteriores. **No se ejecutó SQL durante esta implementación.**

Ambas funciones son SECURITY INVOKER, con search_path vacío y ejecución de cliente solo para authenticated. Verifican administración explícitamente y mantienen RLS en todas las lecturas, bloqueos e inserciones. No exponen la tabla privada, no usan credenciales privilegiadas y no modifican tablas/políticas/triggers.

## Flujo

En Cuentas y pagos, “Generar cuotas del mes” abre un diálogo Material con selector de mes, vista previa de alumnos/importes/vencimientos, lista de omitidos y casilla de confirmación. Solo después de previsualizar y confirmar se habilita ejecutar. Cambiar el período o la sesión invalida la vista. No se crea ninguna cuota por abrir el diálogo o consultar la vista.

La vista proviene exclusivamente del servidor y clasifica a cada alumno:

- Inactivo o En pausa: omitido.
- Sin configuración o con habilitada=false: omitido.
- Cuota de entrenamiento existente para alumno/período/concepto normalizado: omitido.
- Activo con configuración habilitada y sin esa cuota: candidato por el importe configurado.

El vencimiento se calcula como primer día del período + min(día configurado, último día del mes) - 1. Por ejemplo, día 31 en febrero de 2028 vence el 29; en febrero de 2027 vence el 28; en abril vence el 30. Se admiten períodos 1900-01 a 9999-12. Son fechas civiles, sin conversiones de huso horario; el período inicial del diálogo usa el día argentino del servicio financiero.

Al confirmar, Angular envía **solo período y huella**. No envía importes, configuraciones ni una lista de IDs para insertar. PostgreSQL vuelve a calcular la vista y compara su huella antes de escribir. La huella md5 es un detector de cambios, no un secreto ni un mecanismo de autorización. Si el resultado relevante de la vista cambió, devuelve el error identificado `VISTA_MENSUAL_DESACTUALIZADA` sin insertar y exige actualizar/confirmar otra vez. Cambios sin efecto en la vista (por ejemplo día 30→31 en febrero con idéntico vencimiento) no obligan a repetirla.

## Transacción y dos administradores

Se toma un advisory lock de transacción por período y se bloquean las filas actuales de alumnos/configuraciones en orden de ID. Así las dos ejecuciones del mismo mes se serializan y las ediciones de candidatos existentes no se intercalan con su generación. Tras esperar los bloqueos se vuelve a consultar la vista. Una segunda confirmación de una vista anterior a la primera generación se rechaza y debe refrescarse; no se sobrescribe el lote anterior.

La restricción única existente es la defensa final frente a altas manuales concurrentes. `ON CONFLICT ON CONSTRAINT cuotas_alumno_periodo_concepto_unique DO NOTHING` omite la cuota ya creada sin actualizar importe, vencimiento, pagos ni ninguna otra columna histórica. Se informa ese caso como “Cuota creada concurrentemente”. Un alumno/configuración nuevo confirmado después de capturar la vista del servidor queda para una próxima previsualización; no se mezcla a mitad del lote.

Las inserciones están en una subtransacción PL/pgSQL. Un error controlado de restricción/FK/NOT NULL/trigger revierte **todas** las cuotas nuevas del lote y retorna estado `revertida`. No hay éxito parcial. Errores de autorización, serialización, deadlock o cancelación no se convierten en éxito: abortan y requieren revisar/actualizar, sin reintento automático. Un timeout HTTP puede dejar resultado incierto; no repetir a ciegas, volver a previsualizar. Los bloqueos se liberan al terminar la transacción, no quedan bloqueos de sesión.

Los bloqueos de filas abarcan el conjunto actual del estudio, por lo que dos meses distintos también pueden esperar por esos mismos alumnos. Es una decisión conservadora de consistencia para esta etapa. Antes de operar con volúmenes grandes, medir duración, límites de solicitudes y carga de bloqueos. Referencias: [bloqueos PostgreSQL](https://www.postgresql.org/docs/15/explicit-locking.html), [INSERT y conflictos](https://www.postgresql.org/docs/16/sql-insert.html).

## Recuentos y actualización de la pantalla

El resultado confirmado incluye período, estado, generadas, omitidas, fallidas y motivos de omisión.

- `confirmada`: generadas = inserciones efectivas; omitidas = alumnos descartados inicialmente más conflictos concurrentes; fallidas = 0.
- `revertida`: generadas = 0; omitidas = descartados inicialmente más conflictos concurrentes ya detectados; fallidas = **las demás candidatas no generadas por reversión del lote**, incluso las insertadas y luego revertidas. No significa que cada candidata tenga un error individual.
- Error de conexión/permisos/cancelación sin resultado confirmado: no se inventan contadores ni se muestran ceros como éxito. La vista queda invalidada y se exige actualizar.

Después del resultado se releen las cuentas de PostgreSQL antes de anunciar éxito financiero. Si la escritura devolvió resultado pero falla la recarga, el diálogo conserva esos recuentos confirmados y muestra el aviso de que la operación ya fue procesada; bloquea otra operación hasta actualizar. Un cambio de sesión descarta resultados tardíos. Se deshabilitan confirmación repetida y cierre por Escape/backdrop durante la generación.

No se consulta, migra, borra ni sobrescribe localStorage. No se crean alumnos, configuraciones ni datos mock en la base. Solo se insertan las cuotas expresamente confirmadas a partir de alumnos/configuraciones existentes. No se cambia la lógica del ABM, pagos, respaldo local ni estadísticas de Dashboard.

## Pruebas ejecutadas y pendientes

Validación final ejecutada: **148 tests aprobados en 13 archivos** y build de producción correcto para `/rochi.entrena/`. Continúa la advertencia existente del bundle inicial (787,93 kB frente a 500 kB orientativos). `git diff --check` sin errores. No se ejecutó ninguna prueba SQL contra Supabase.

Las pruebas locales cubren contratos JSON, fechas válidas y bisiestas recibidas, rechazo de respuestas/contadores inválidos, permisos, período inválido, RPC ausente, huella desactualizada, doble confirmación, espera de respuesta, reversión, recarga fallida tras resultado confirmado, cambio de mes/sesión y ausencia de acceso a localStorage. Se mantiene la suite de cuotas/pagos y respaldos. Estas son pruebas con respuestas simuladas; **no prueban la ejecución SQL ni la concurrencia real**.

Se preparó `docs/database/prueba-generacion-mensual.sql` para ejecución manual en un entorno de pruebas con alumnos/configuraciones ya existentes. Completar UUID de administrador y período elegido. Comprueba elegibilidad, importe/vencimiento contra configuración, generación, rechazo de huella vieja, repetición sin duplicados y conservación íntegra de cuotas históricas. Finaliza con ROLLBACK; no crea alumnos ni siembra mocks. Con cero candidatos la prueba de altas queda sin cubrir: elegir otro período/configuración real del entorno. No se ejecutó este guion. No sustituye las pruebas HTTP con sesiones legítimas.

Recorrido real después de revisar/aplicar 004:

1. Usar alumnos/configuraciones existentes en un proyecto de pruebas, con casos activos, pausados/inactivos, sin configuración y deshabilitados. Previsualizar y comparar cada motivo con la base.
2. Probar días 29/30/31 en febrero bisiesto/no bisiesto y meses de 30/31 días. Comparar importe/vencimiento retornado; no asumir que la validación de fechas de TypeScript prueba el cálculo SQL.
3. Confirmar un lote. Comprobar recuentos, misma cantidad de filas nuevas y saldos tras recargar. Repetir vista del período: las existentes se omiten. Cambiar una tarifa y confirmar otro mes; verificar que los importes históricos anteriores no cambian.
4. Abrir dos sesiones administrativas, previsualizar el mismo mes y confirmar simultáneamente. Una genera; la otra debe pedir nueva vista o, si un alta manual interfiere durante la inserción, omitir el conflicto. Verificar ausencia de duplicados y no sobrescritura.
5. Cambiar configuración/estado que afecte la vista después de previsualizar: confirmar debe rechazar la huella vieja sin crear cuotas. Refrescar y confirmar solo tras revisar los nuevos valores.
6. Probar ambas RPC mediante API con cliente anónimo y JWT de no administrador: acceso denegado, sin cambios en cuotas. No usar SQL Editor como prueba de los roles reales.
7. Bloquear RPC/red: sin éxito anticipado ni contadores inventados. Si la generación fue confirmada y solo falla la recarga, verificar el aviso y que no permita reenviar sin actualizar. En una base aislada, comprobar reversión del lote ante error de inserción antes de producción; no alterar tablas, triggers o RLS del proyecto operativo para simular fallos.

MFA/aal2, la validación SQL real de esta migración y la prueba de concurrencia con dos conexiones quedan pendientes. No hubo commit, push ni deploy.
