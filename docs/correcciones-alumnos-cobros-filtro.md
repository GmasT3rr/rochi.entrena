# Correcciones de Alumnos y Cuotas

## Acciones de estado

`alumno-estado-acciones.ts` concentra la confirmación y la llamada existente a
`AlumnosService.cambiarEstado`. Lo consumen tanto el listado como la ficha.
No elimina al alumno ni modifica cuotas, pagos, cobros o documentos.

En el Resumen, la acción se encuentra después de Ver en Cuentas y antes del
footer Volver al listado. La tabla y las tarjetas móviles ofrecen Dar de baja o
Reactivar según el estado.

## Edición de cobros

`AlumnoFinanzas` abre el mismo `CobroDirectoForm` de Cuotas, indicando el alumno
de la ficha. El detalle permite pasar a edición en el mismo diálogo. Cancelar
restaura los valores y vuelve a lectura. El alumno queda bloqueado en este contexto;
las operaciones iniciadas desde el listado general conservan su comportamiento.

Guardar llama a `CuentasService.guardarCobro` y al repositorio Supabase existentes,
con sus validaciones, versión, actualización del snapshot y toast. La ficha sigue
abierta y su historial consume las mismas señales que el listado general.

## Causa del filtro persistente

`CuentasService` es singleton y guarda `filtros.alumnoId`. La entrada sin parámetros
no lo limpiaba. No se encontró almacenamiento local como causa de esta selección.
`Cuentas` ahora limpia únicamente el alumno al entrar y al destruirse. Una URL con
alumno explícito lo aplica después de disponer de los datos autorizados, incluso
si coincide con una visita anterior. Las actualizaciones y los diálogos no recrean
el componente ni reinician la selección. Se conserva la gestión existente del período.

## Archivos de esta corrección

- `src/app/features/alumnos/alumno-estado-acciones.ts` (nuevo).
- `src/app/features/alumnos/alumnos.ts` y `alumnos.html`.
- `src/app/features/alumnos/alumno-ficha.ts`, `.html` y `.scss`.
- `src/app/features/alumnos/alumno-finanzas.ts` y `.spec.ts`.
- `src/app/features/alumnos/ficha-unificada.spec.ts`.
- `src/app/features/cuentas/cobro-directo-form.ts` y `.html`.
- `src/app/features/cuentas/cuentas.ts`.
- `src/app/features/cuentas/cobros-directos.spec.ts`.
- `src/app/features/cuentas/filtro-alumno-navegacion.spec.ts` (nuevo).

## Verificación ejecutada

- Suite completa: 49 archivos, 428 tests aprobados. Incluye confirmaciones reales
  con repositorio simulado para baja cancelada, cambio de estado y reactivación;
  edición, cancelación y error de cobros; navegación del router hacia Dashboard,
  Alumnos, Configuración y Guía, regreso normal y entrada explícita.
- Edge con datos simulados: 320, 375, 768 y 1440 px. Se verificaron el scroll hasta
  las acciones inferiores, ausencia de desbordes, lectura/edición en el mismo diálogo,
  alumno bloqueado, cancelación y actualización del historial sin cerrar la ficha.
- Build de producción correcto, con la advertencia existente de bundle inicial
  de 913,05 kB frente al umbral de advertencia de 500 kB.
- `git diff --check` correcto.

No se probaron escrituras ni recargas contra Supabase remoto autenticado. La ruta de
persistencia existente permanece conectada; las verificaciones de esta corrección
usan repositorios simulados. No se modificaron SQL, RLS, autenticación, auditoría,
documentos, entrenamiento ni reglas o cálculos financieros. Sin commit ni push.
