# Agenda · Etapa 2

La interfaz aprobada se conserva. `Calendario` provee `AgendaSupabase`, que usa el cliente y la autorización administrativa existentes a través de `AgendaApi`. `AgendaMemoria` solo se usa como fixture en pruebas: no hay fallback, almacenamiento local ni simulación de un guardado real.

## Archivos SQL e instalación manual

- Migración: `docs/database/016-agenda-entrenamientos.sql`.
- Verificaciones: `docs/database/verificar-agenda-entrenamientos.sql`.
- Ninguno fue ejecutado por el agente. El esquema instalado y las políticas reales aún deben comprobarse en Supabase.

Orden exacto:

1. Revisar el esquema instalado contra `rochy-propuesta.sql`, `001-autorizacion-administrativa.sql` y `005-aislamiento-por-usuario.sql`. La última migración numerada del repositorio antes de Agenda es 015. Verificar `alumnos.id text`, `alumnos.propietario_id uuid NOT NULL`, `UNIQUE(propietario_id,id)`, `es_administrador_actual()`, `rochy_privado.auditar()`, `marcar_actualizacion()` e `impedir_cambio_propietario()`, y `historial.propietario_id NOT NULL`. Si ya están aplicadas las migraciones del proyecto, no volver a ejecutarlas. 005 necesita mapas explícitos de propietarios: no reinstalarla ni completarlos por inferencia. Agenda no depende de Cron, Storage ni de las RPC financieras de 015.
2. Con un respaldo y un operador postgres, revisar y ejecutar **el archivo completo 016 una sola vez**, desde BEGIN hasta COMMIT. No ejecutar fragmentos si hay un error: hacer ROLLBACK, resolver la dependencia indicada y volver a revisar. El preflight aborta si faltan tipos/funciones base; la FK comprueba la clave compuesta de alumnos. No cambia tablas, funciones ni políticas de otros módulos.
3. Ejecutar **solo la sección 1** del archivo de verificaciones, como postgres. Deben aparecer las dos tablas públicas con RLS y propietario postgres, dos políticas por tabla (una restrictiva), SELECT para authenticated sin DML, las FK compuestas, los índices y triggers de actualización/auditoría/integridad. Las dos RPC deben permitir EXECUTE a authenticated y denegarlo a anon. La consulta de consistencia de participantes debe devolver cero filas.
4. Para la **sección 2** de verificación, completar los dos UUID Auth de administradores activos distintos en `agenda.verificar_a/b`. A debe tener al menos dos alumnos y diciembre de 2099 libre para los fixtures. Ejecutar esa sección completa hasta **ROLLBACK**, sin convertirlo en COMMIT. Prueba grupos, alta, edición, repetición finita, idempotencia, versión obsoleta, simultáneos legítimos, atomicidad ante conflictos, aislamiento A/B, alumnos de otro propietario, DML directo, cancelación, usuario no administrador y anon. Inspecciona auditoría antes de revertir. Ante un error hacer ROLLBACK; no continuar desde una transacción abortada.
5. Iniciar sesión en el frontend como A, abrir Agenda y pulsar Actualizar. Crear un grupo, recargar el navegador y comprobar su permanencia. Editarlo, repetir un turno dentro del mes y cancelar una ocurrencia; verificar que las otras permanecen y que la ficha del alumno abre. Navegar por una semana entre meses y comprobar sus extremos. Como B, comprobar que no aparecen datos de A. Revisar las peticiones de red: solo fechas del mes visible y vecinos de la semana; ninguna consulta global ni generación automática futura.

La migración incluye `NOTIFY pgrst, 'reload schema'`. Si PostgREST aún informa caché de esquema antigua, esperar su recarga y pulsar Actualizar. No añadir credenciales administrativas al frontend.

## Tablas y funciones nuevas

- `public.agenda_entrenamientos`: UUID, propietario, fecha y horas locales de inicio/fin, título opcional, modalidad, observaciones, estado, participantes canónicos, serie/días de repetición, cancelación y timestamps.
- `public.agenda_entrenamiento_alumnos`: relación muchos a muchos, con FK compuestas al entrenamiento y al alumno del **mismo propietario**. No elimina alumnos ni turnos; conserva relaciones al cancelar.
- `rochy_privado.agenda_solicitudes`: solicitudes idempotentes y su resultado confirmado por propietario. RLS habilitada, sin grants cliente. Sin expiración automática: una política futura de retención debe preservar las garantías de reintento; no se instala Cron.
- `public.guardar_entrenamiento_agenda(uuid,text,jsonb,integer[],uuid,timestamptz,boolean)`: alta o edición atómica, participantes y repetición materializada hasta fin del mes indicado.
- `public.cancelar_entrenamiento_agenda(uuid,uuid,timestamptz)`: cancelación lógica versionada e idempotente.
- `rochy_privado.validar_participantes_agenda()`: trigger diferido de integridad que impide grupos vacíos o diferencias entre el snapshot canónico y las relaciones.

Las dos RPC usan SECURITY DEFINER con search_path vacío, owner postgres y controles explícitos `auth.uid()` + `es_administrador_actual()`. No aceptan propietario desde el cliente. El cliente tiene SELECT bajo RLS y no puede escribir directamente para saltarse versiones, validaciones o la transacción de participantes. Se reutilizan auditoría, timestamps e inmutabilidad de propietario de 005/base.

Cada operación bloquea únicamente las escrituras de Agenda del propietario mediante un advisory lock transaccional, valida alumnos y versión y confirma todo el lote o nada. La versión se conserva como texto timestamptz sin pasar por Date, evitando perder microsegundos. Guardados/cancelaciones repetidos con igual solicitud y contenido devuelven el resultado anterior; reutilizar una solicitud para otro contenido se rechaza. La tabla privada se registra en la misma transacción que el cambio.

## Integración y reglas conservadas

- Lectura paginada de entrenamientos programados, con fechas acotadas al mes del calendario lateral más los extremos de la semana visible. Cambiar de día dentro del mismo intervalo no repite la consulta. Cancelados permanecen en base/auditoría y desaparecen de la grilla.
- Altas, edición de una ocurrencia, cancelación y repetición semanal se confirman por RPC. La repetición incluye la fecha inicial y los días seleccionados posteriores hasta el último día de ese mes; no hay regla recurrente, tarea ni Cron para meses futuros.
- Se bloquea el doble envío en formulario y servicio. Durante una escritura se bloquea cerrar por Escape/backdrop. Los errores mantienen datos y modal abiertos. Se muestran errores de instalación pendientes, permisos, concurrencia y red.
- Una respuesta confirmada se anuncia como guardada en Supabase; luego se refresca solo el intervalo visible. Si falla ese refresco, la escritura sigue confirmada y la pantalla muestra el error de lectura y Actualizar; no se vuelve a ejecutar el alta. Si se pierde la respuesta de una escritura, el reintento con el mismo contenido conserva su UUID mientras la pantalla siga viva.
- Al cambiar sesión/recuperación o salir de Agenda se descartan cachés y respuestas tardías. Reintentar después de salir no conserva la clave cliente anterior, pero las comprobaciones de solapamiento por alumno/índice siguen impidiendo duplicados.
- Clases grupales: un entrenamiento con varios alumnos. Alumnos repetidos o ya ocupados en ese intervalo se rechazan también en servidor. Otros simultáneos requieren aceptación explícita y se distribuyen en carriles. Incluso el mismo intervalo y modalidad puede usarse con **participantes distintos** si se confirma: la unicidad no prohíbe simultáneos legítimos. El adaptador de memoria legado de pruebas mantiene sus reglas históricas; producción usa las de 016.
- Horarios civiles de `America/Argentina/Buenos_Aires`: `date` y `time without time zone`; no se convierten a UTC. Fin 24:00 se muestra como 00:00 en el formulario, manteniendo duración hasta fin del mismo día. Auditoría y versiones usan timestamptz. Hoy se calcula con Intl y el huso argentino, independientemente del navegador.
- Se conservan las vistas día/semana laboral/completa/mes, la grilla, el modal, los grupos y las fichas existentes. No se incluye arrastre, actualización en tiempo real ni edición de series completas. Otros clientes se reflejan al navegar o pulsar Actualizar; las versiones evitan sobrescribir cambios ajenos.

## Validación y límites

Tests frontend de contrato SDK simulado, autorización, rangos, paginación, fechas argentinas, medianoche, idempotencia, doble envío, respuestas tardías, errores tras COMMIT y sesiones; pruebas de interfaz y controles compartidos; build de producción. Las pruebas SDK **no certifican RLS ni PL/pgSQL en la instancia real**. El SQL y las verificaciones quedan para ejecución manual tras revisión; no se ejecutaron comandos SQL, conexiones ni modificaciones remotas.

La revisión visual de la interfaz de Etapa 1 se realizó en Edge a 320 y 1440 px. En esta etapa se agregan estados operativos y bloqueo de envío, sin rediseñar. El build conserva las advertencias existentes de bundle inicial, presupuesto de estilos del calendario y CommonJS de jszip.
