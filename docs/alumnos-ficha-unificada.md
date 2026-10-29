# Ficha como acceso único al alumno

El listado ofrece **Ver ficha** en escritorio y mobile. Se retiró el acceso al
editor completo independiente y se trasladaron las acciones de baja y reactivación
al Resumen, conservando su confirmación y servicio actuales.

Resumen abre el mismo `AlumnoForm` que utiliza el alta, limitado a datos personales,
información adicional o configuración mensual. Cada edición conserva los campos
ajenos a su sección. El guardado actualiza las señales del servicio sin cerrar ni
recrear la ficha. La protección `CambiosPendientes` sigue advirtiendo al descartar
modificaciones. La búsqueda, modalidad y estado del listado permanecen al volver.

Finanzas, Documentos y Entrenamiento mantienen sus componentes y operaciones
existentes. No se modificaron PostgreSQL, permisos, auditoría ni cálculos financieros.
Los documentos y el perfil requieren sus respectivos servicios y esquemas existentes;
este cambio no instala migraciones.

## Verificación

- Suite completa: 48 archivos, 421 tests aprobados.
- Integración con repositorio simulado: abrir desde listado, evitar fichas duplicadas,
  descartar cambios, guardar y recargar, cambiar estado y regresar conservando filtros.
- Tests de edición por secciones, confirmación de estado, cancelación y errores,
  junto con los consumidores existentes de documentos, entrenamiento y finanzas.
- Edge con datos simulados: 320, 375, 768 y 1440 px; estados completos e incompletos,
  apertura de los tres editores y navegación de regreso desde Finanzas.
- Build de producción aprobado; conserva la advertencia de bundle inicial de 913,05 kB.

No se realizaron escrituras ni pruebas de persistencia contra Supabase remoto.
