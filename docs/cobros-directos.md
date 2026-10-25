# Cobros directos

Implementación Angular y migración preparada, sin aplicar cambios en Supabase.
Se inspeccionó el esquema versionado en `docs/database`; no se consultó el esquema
del proyecto remoto. Antes de aplicar, comparar sus objetos con el esquema real.

## Modelo y persistencia

`CobroDirecto` (`src/app/core/cobros-directos.ts`) tiene id, alumnoId, concepto,
importe, fecha, medio y observaciones. No tiene cuota, período ni vencimiento.
Comparte validaciones monetarias, fechas civiles y medios con pagos existentes.

`CuentasSupabaseRepository` lee los cobros en la misma RPC e instantánea que
alumnos, cuotas y pagos; escribe exclusivamente en `cobros_directos`. Las
correcciones y bajas usan `actualizado_en` como control de concurrencia.

`CuentasService` conserva colecciones independientes y expone `ingresos`, que
concatena una vez los pagos de cuotas y una vez los cobros directos. Dashboard,
evolución mensual, total recaudado y exportación consolidada usan esta fuente.
Todos suman importes en centavos según la fecha de cobro. Los cálculos de saldo,
pendientes, vencidas y generación mensual siguen usando únicamente cuotas y pagos.

Cada formulario conserva un UUID de alta durante sus reintentos. La PK impide
reinsertar ese mismo cobro; no hay unicidad por concepto, alumno ni fecha.
Se bloquean envíos simultáneos. Ante resultado incierto se exige actualizar antes
de seguir operando, como en pagos. No volver a crear un cobro desde otro formulario
sin verificar primero si el anterior persistió.

La tabla usa `public.importe_ars`, FK compuesta propietario/alumno, fecha civil,
timestamps y triggers existentes de actualización y auditoría. Agrega control de
fecha no futura en zona Argentina. Tiene RLS administrativa por propietario y una
política restrictiva adicional. No concede acceso a anon ni escritura al historial.
No cambia tablas, datos ni triggers de pagos o cuotas.

## Aplicación manual en Supabase

1. Revisar `docs/database/011-cobros-directos.sql` contra el esquema real y las
   migraciones previas. Requiere los objetos de autorización, aislamiento y auditoría
   ya existentes. No ejecutar sobre una base sin esas migraciones.
2. Aplicar manualmente la migración revisada en un proyecto de prueba. La tabla
   nace vacía; la RPC incorpora `cobros_directos` sin cambiar su firma.
3. Completar los UUID de dos administradores de prueba en
   `docs/database/prueba-cobros-directos.sql` y ejecutarlo manualmente. Termina en
   ROLLBACK. Verifica altas, repetición legítima, restricciones, edición, RPC,
   aislamiento, bajas y tres entradas de auditoría. Rechaza acceso anónimo y no admin.
4. Verificar también con sesiones reales de Supabase desde la app. Ninguna clave
   service_role se agrega al frontend. Aplicar luego en producción por el proceso
   habitual de revisión y despliegue.

## Prueba funcional

1. Entrar en Cuotas y cobros → Nuevo movimiento → Cobro directo. Elegir alumno, concepto,
   importe y medio; la fecha comienza en hoy de Argentina. Guardar.
2. Actualizar o recargar la app y verificar persistencia. Abrir Detalle, editar el
   importe y comprobar que el ingreso cambia. Registrar otro del mismo concepto:
   debe aceptarse como un ingreso separado.
3. Abrir la ficha del alumno: el bloque Cobros directos muestra esos movimientos,
   sin incrementar saldo pendiente ni crear cuotas.
4. Elegir el mes de la fecha en Dashboard y Cuotas y cobros: el total debe sumar
   pagos de cuotas más cobros directos una sola vez. Probar fechas de otro mes.
5. En el listado unificado, combinar Tipo, Alumno, Estado, Modalidad, búsqueda por
   alumno/concepto y Mes/Año. Las cuotas se filtran por período; los cobros directos,
   por fecha de cobro. En Exportaciones, Exportar movimientos filtrados respeta el
   listado; Exportar ingresos del período incluye pagos y cobros según fecha,
   independientemente de los demás filtros. Ambas exportaciones identifican Tipo
   y usan el escape CSV compartido. La ficha del alumno conserva sus filtros de
   fecha específicos y su exportación de cobros directos.
6. Eliminar con confirmación; comprobar descuento del total y auditoría SQL.
7. Registrar y editar un pago de cuota, revisar vencidas y generar una vista previa
   mensual: conservar comportamiento anterior. Los cobros directos no participan.
8. Repetir con teclado y a 320, 375, 768 y 1280 px, tema oscuro: controles sin
   desbordamiento, foco visible y acciones accesibles. Tabla y tarjetas móviles
   usan la misma fuente y acciones, con el breakpoint compartido de 850 px.

## Validación y límites

Las pruebas automatizadas verifican validaciones, repositorio autorizado, control
de versión, alta/edición/baja simuladas, persistencia del snapshot, ausencia de
deuda, consolidación, filtros, formulario y CSV. No sustituyen pruebas reales
de PostgreSQL ni sesiones HTTP reales. Estas quedan pendientes hasta aplicar la
migración en un entorno de prueba.

La reorganización posterior de Cuotas y cobros usa un adaptador de presentación
(`movimientos-vista.ts`) con claves distintas por origen, una tabla y una vista de
tarjetas que comparten filtros y acciones. Nuevo movimiento reúne los formularios
existentes; Más acciones ordena las operaciones de cada fila. Los cobros directos
reutilizan la misma confirmación y control de versión desde el listado y la ficha.
No requiere nuevas migraciones ni cambia cálculos financieros.

Verificación de la reorganización: 301 pruebas aprobadas y build de producción
correcto, con advertencia de bundle inicial (910,68 kB frente a 500 kB). Se revisó
en Edge con datos locales a 320, 375, 768 y 1280 px, sin desbordamiento horizontal:
tarjetas en móvil/tablet y tabla en escritorio. Se comprobaron Enter/Escape, foco
del menú, ambos formularios desde Nuevo movimiento y las acciones por tipo. Estas
comprobaciones visuales no accedieron a Supabase.

Los servicios locales de respaldo heredados no son la fuente remota de ingresos.
Las nuevas exportaciones CSV se ofrecen en el menú Exportaciones de Cuotas y cobros; no se cambia el formato
JSON de respaldo local ni se incorpora restauración de cobros remotos.
