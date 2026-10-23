# Actualización automática de Alumnos

Crear, editar, dar de baja y reactivar siguen usando la respuesta confirmada del repositorio para actualizar la Signal compartida: no hay una consulta adicional por cada guardado ni éxito anticipado. Estas operaciones invalidan la antigüedad del listado para la próxima revisión de vigencia.

Al entrar a Alumnos, recuperar foco o volver a una pestaña visible, se consulta solo si la lista está pendiente de validar o tiene más de 60 segundos. No hay polling. Se omiten comprobaciones si no hay sesión, hay una carga o un guardado en curso. Las señales de carga evitan solicitudes superpuestas; después de un error, los reintentos automáticos tienen un intervalo mínimo de 30 segundos. El botón Reintentar aparece exclusivamente ante un error y no tiene esa espera artificial.

Búsqueda, modalidad y estado viven ahora en el servicio de sesión para conservarse al recrear la vista o navegar. Los listeners de foco/visibilidad se eliminan al salir de Alumnos.

Un refresco de una lista ya cargada mantiene las filas visibles con un estado discreto y aria-busy; el skeleton se usa solo cuando no hay una lista confirmada. Si falla el refresco se conserva la última lista con aviso explícito y Reintentar; si se deniega autorización, se descarta la lista. El contador se oculta ante error para evitar interpretar el fallo como cero resultados. Los controles administrativos y RLS existentes siguen aplicándose a las consultas.

Se retiró Actualizar de la barra y se limpiaron textos técnicos del listado, ficha, formulario y mensajes de servicio. No se modificaron Supabase, SQL ni reglas de alumnos/finanzas.

Las pruebas incluyen altas, edición, baja y reactivación confirmadas, conservación de filtros, vigencia, ausencia de solicitudes duplicadas, refresco con filas visibles, error y denegación de acceso. La comprobación de red real, foco y navegación en navegador autenticado queda pendiente; las pruebas locales usan respuestas simuladas.

No hubo commit, push ni deploy.
