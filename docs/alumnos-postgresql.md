# Alumnos en PostgreSQL: transición de persistencia

Actualización posterior: Cuentas y pagos ya se implementaron para PostgreSQL; ver [Cuentas en PostgreSQL](cuentas-postgresql.md) para la migración 003 pendiente de ejecución manual. La separación local descrita a continuación corresponde a la etapa anterior; actualmente solo el archivo de respaldos conserva esos servicios locales, Dashboard es informativo y generación mensual está deshabilitada.

## Instalación manual necesaria

La aplicación ya consulta `public.alumnos` y su relación uno a uno con `public.configuraciones_mensuales`. Para habilitar altas y ediciones, revisar y ejecutar **manualmente como postgres** `docs/database/002-guardar-alumno-configuracion.sql`, una sola vez. No ejecutar nuevamente el esquema inicial ni la migración 001, ya instalados. No se ejecutó SQL ni se insertaron registros remotos durante el desarrollo de esta etapa.

La migración no altera tablas, propietarios de tablas, políticas RLS ni datos existentes. Agrega una RPC SECURITY INVOKER con search_path vacío, ejecución solo para authenticated y comprobación explícita de administración. Al ejecutarse conserva los permisos/RLS del usuario. Escribe alumno y configuración en una sola transacción; una restricción inválida revierte ambas escrituras y su auditoría. No hay fallback con dos escrituras HTTP independientes ni guardado local cuando falla Supabase.

El ID es TEXT y se conserva al editar. En altas nuevas se genera UUID en el formulario y se mantiene al reintentar dentro del mismo diálogo, evitando otro ID cuando se desconoce el resultado de una solicitud. Un INSERT duplicado no sobrescribe un alumno existente. Después de un error o timeout, actualizar el listado antes de reintentar: la solicitud pudo haberse confirmado en el servidor aunque la respuesta no llegara. Cerrar y abrir otro formulario genera otro ID; no se promete idempotencia entre formularios ni entre dispositivos.

La RPC no cambia `proxima_cuota_original` de registros existentes. Deshabilitar configuración conserva importe y día; si nunca existió, puede continuar sin fila. La ausencia/null de configuración en una edición deshabilita una fila previa sin borrarla. Las ediciones se serializan con el UPDATE del alumno, pero no incorporan control de versiones: la última edición puede reemplazar datos enviados desde una pantalla antigua.

## Arquitectura y funcionalidades

- `AlumnosSupabaseRepository`: listado paginado, consulta por ID, mapeo snake_case/camelCase, guardado RPC, cambio de estado y consulta de configuración. Verifica sesión/autorización antes de operar y descarta resultados de otra sesión; la seguridad de datos sigue siendo RLS.
- `AlumnosService` (exportado desde `alumnos-service.ts`, implementado en `alumnos-remotos-service.ts`): Signals de alumnos, carga, guardado, error y confirmación. Sin localStorage ni MockData. No publica cambios antes de recibir una fila válida del servidor. Recarga al cambiar/restaurar la sesión y permite actualizar manualmente. Los listados de varias páginas no son un snapshot transaccional frente a escrituras concurrentes.
- Los componentes del ABM solo usan el servicio: alta, edición, filtros/búsqueda, ficha, baja lógica/reactivación y configuración mensual mantienen diseño y validaciones. Se bloquearon envíos repetidos y cierre por Escape/backdrop durante el guardado.
- En la ficha remota se muestran configuración habilitada o deshabilitada y sus valores conservados. No se muestra un saldo cero o historial vacío calculado desde finanzas locales: esas fuentes todavía no están relacionadas.

## Separación de datos locales

`AlumnosLocalService` conserva el comportamiento anterior y `AlumnosRepository` sigue siendo el repositorio local existente. Solo Cuentas, su formulario, generación mensual, Dashboard y respaldos lo consumen. Cambiar un alumno remoto **no** cambia la elegibilidad, nombre, estado o importe de su posible homónimo local. Incluso IDs iguales se consideran fuentes separadas; no hay unión automática.

| Pantalla / operación | Fuente actual |
| --- | --- |
| ABM Alumnos y configuración mensual de ese ABM | PostgreSQL |
| Dashboard completo, incluidos alumnos activos | Local, rotulado como tal |
| Cuentas, cuotas, pagos y generación mensual | Local, con alumnos anteriores |
| Exportación CSV de alumnos desde Configuración | Alumnos locales anteriores |
| Copia y restauración JSON | Solo conjunto local anterior |

Los avisos en las pantallas explican esta transición. Los nombres de las clases internas de Cuentas se mantienen mediante un alias de importación al servicio local. No se cambiaron claves de localStorage, modelos persistidos ni relaciones de cuotas/pagos. El ABM remoto no lee, borra ni escribe las claves locales y nunca siembra mocks en Supabase. Los flujos locales preexistentes mantienen su inicialización y restauración habituales; una restauración explícita continúa reemplazando únicamente el conjunto local.

## Pruebas locales y reales

Verificación final ejecutada: **108 tests aprobados en 8 archivos** (`npm test -- --watch=false`) y build de producción correcto (`npm run build -- --configuration production --base-href /rochi.entrena/`). El bundle inicial conserva la advertencia de presupuesto: 786,59 kB frente a los 500 kB orientativos. `git diff --check` pasó.

Se añadieron pruebas con cliente/repositorio simulados para mapeo, ID, consulta individual, estado, configuración deshabilitada, paginación, RPC única, sesión ausente, permisos denegados, errores del servidor/red, confirmación antes de mostrar éxito, validaciones del formulario, reintento con mismo ID, conservación byte a byte de las tres claves locales y aislamiento con IDs coincidentes. Las pruebas previas de finanzas y respaldos apuntan ahora explícitamente al servicio local para mantener su cobertura.

Las pruebas unitarias no prueban PostgreSQL real ni la atomicidad real de la función. Se preparó `docs/database/prueba-alumnos-transaccion.sql` para revisión/ejecución manual en un proyecto de pruebas: simula el rol authenticated con un administrador existente, fuerza una configuración inválida y exige que no quede alumno parcial; prueba alta, edición, deshabilitación y baja, todo con ROLLBACK. No se ejecutó este script.

Procedimiento manual por UI/API, después de aplicar 002:

1. Guardar una copia de los valores locales existentes y abrir Alumnos con una sesión administrativa. Un PostgreSQL vacío debe mostrar “Todavía no hay alumnos en PostgreSQL”, sin importar alumnos locales. Probar filtros sin resultados.
2. Crear un alumno de prueba sin cobro mensual. Esperar el éxito, abrir ficha, actualizar y recargar navegador; comprobar mismo ID/datos en la API y la tabla.
3. Editar datos personales y habilitar cobro con importe y día válidos. Comprobar en Supabase ambas filas y su relación por alumno_id. Deshabilitar, recargar y reabrir: importe y día deben conservarse; reactivar configuración. No deben crearse cuotas/pagos.
4. Dar de baja y reactivar. Verificar que cambia estado, no se borra fila ni se altera ID/configuración. Comprobar que `proxima_cuota_original` previo permanece.
5. Bloquear la RPC o cortar la red al guardar: no debe cerrar el formulario ni mostrar éxito ni actualizar la memoria antes de confirmación. Reponer conexión y actualizar antes de reintentar. Bloquear el listado: mostrar error y permitir Actualizar, sin usar datos locales como fallback.
6. Sin sesión o con cuenta sin administración, los guards deben denegar el panel. Desde un cliente API de ese rol, intentar llamar `guardar_alumno_con_configuracion` y actualizar estado: deben denegarse sin modificar las filas. Repetir las pruebas RLS incluyendo esta RPC nueva; las pruebas anteriores no la cubren.
7. Revisar que las claves locales mantienen sus valores y Cuentas, generación mensual y respaldos siguen mostrando únicamente su conjunto anterior, también cuando algún ID coincide con un alumno remoto. La restauración local nunca debe modificar PostgreSQL.

El usuario informó que las pruebas RLS previas fueron satisfactorias. En esta etapa no se repitieron con credenciales reales ni se probaron altas remotas: requieren instalar manualmente la nueva función y una sesión del entorno de pruebas. No se usaron claves secretas, no se hicieron commits/push ni despliegues.

## Antes de migrar finanzas

Definir una migración explícita y revisable para mapear IDs locales a remotos sin colisiones y preservar todas las referencias históricas. No unir por nombre/email ni asumir que IDs iguales identifican a la misma persona. Migrar cuotas/pagos, su generación y respaldos conjuntamente con pruebas de integridad y conciliación. Hasta entonces, configurar cobro remoto no cambia la generación mensual local. Faltan exportación/respaldo remoto, pruebas reales de la RPC 002 y concurrencia entre administradores; MFA/aal2 sigue pendiente. No presentar esta etapa como lista para datos reales.

## Archivos de esta etapa

Nuevos:

- `src/app/core/services/alumnos-local-service.ts`
- `src/app/core/services/alumnos-remotos-service.ts`
- `src/app/core/services/alumnos-supabase-repository.ts`
- `src/app/core/services/alumnos-supabase.spec.ts`
- `docs/database/002-guardar-alumno-configuracion.sql`
- `docs/database/prueba-alumnos-transaccion.sql`
- `docs/alumnos-postgresql.md`

Modificados:

- `src/app/core/services/alumnos-service.ts`
- `src/app/core/services/alumnos-service.spec.ts`
- `src/app/core/services/cuentas-service.ts`
- `src/app/core/services/cuentas-service.spec.ts`
- `src/app/core/services/respaldo-service.ts`
- `src/app/core/services/respaldo-service.spec.ts`
- `src/app/features/alumnos/alumnos.ts`
- `src/app/features/alumnos/alumnos.html`
- `src/app/features/alumnos/alumno-form.ts`
- `src/app/features/alumnos/alumno-form.html`
- `src/app/features/alumnos/alumno-form.spec.ts`
- `src/app/features/alumnos/alumno-ficha.ts`
- `src/app/features/cuentas/cuenta-form.ts`
- `src/app/features/cuentas/generar-mensual.ts`
- `src/app/features/cuentas/cuentas.html`
- `src/app/features/dashboard/dashboard.ts`
- `src/app/features/dashboard/dashboard.html`
- `src/app/features/configuracion/configuracion.html`

Los cambios en consumidores financieros son importaciones para mantener la fuente local y avisos visuales; su persistencia y reglas de cálculo se conservaron. No se tocaron configuración Supabase, guards, RLS, esquemas originales, claves locales, workflows ni rutas.
