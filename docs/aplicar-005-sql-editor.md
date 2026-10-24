# Aplicar 005 en rochy-dev: recorrido mínimo manual

Decisión actual del usuario: preparar aplicación directa sobre datos de prueba de rochy-dev, sin Docker, otro proyecto ni DEMO. Reemplaza el requisito anterior de ensayar primero en otro proyecto. **Aquí no se ejecutó SQL remoto ni se modificaron datos.** El UUID y autorización fueron verificados por el usuario, según informó.

## 1. Exportar el estado previo — solo lectura

- Abrir SQL Editor del proyecto **rochy-dev** y comprobar Project Ref contra el indicado en la variante privada. Cerrar la aplicación y otras sesiones que escriban, y mantenerlas cerradas hasta terminar.
- Ejecutar como postgres [000-exportacion-minima.private.sql](database/privado/000-exportacion-minima.private.sql).
- Guardar la celda completa `respaldo_minimo` como JSON fuera de todo Git. Si el editor exporta un array con esa columna, conservar el envoltorio sin recortar datos. No basta con una captura de pantalla o el texto truncado de la celda. Verificar que el JSON se abre y contiene las seis tablas en `datos`.
- Comparar sus cinco `conteos_aprobados` con la longitud de los arrays de alumnos/configuraciones/cuotas/pagos/historial. Guardar también el array de administradores. Si hay truncamiento, errores o conteos distintos, detenerse y exportar las tablas completas por separado antes de continuar.

Incluye registros íntegros de aplicación/historial, actor_id, referencias UUID/email de Auth y metadatos de columnas, constraints, índices, secuencias, grants, RLS, funciones y triggers. No incluye hashes de contraseñas, sesiones ni tokens Auth.

**Limitación aceptada para este recorrido:** esto es una exportación mínima de seguridad, no pg_dump ni un paquete SQL de restauración automática. No permite reconstruir credenciales Auth ni recuperar por sí solo todos los objetos/configuración de Supabase. Los metadatos ayudan a una recuperación manual, pero no garantizan un rollback después del commit. Si se necesita recuperación completa ensayada, detenerse y usar el procedimiento de backup lógico anterior.

## 2. Revisar y completar el SQL definitivo

Archivo completo: [005-todos-a-propietario.private.sql](database/privado/005-todos-a-propietario.private.sql). Está ignorado por Git.

Solo completar los dos parámetros al principio:

```sql
set local tcf.asignacion.project_ref = 'PROJECT_REF_VERIFICADO';
set local tcf.asignacion.conteos = '{"alumnos":0,"configuraciones":0,"cuotas":0,"pagos":0,"historial":0}';
```

Los ceros del ejemplo NO son valores sugeridos: pegar exactamente el objeto `conteos_aprobados` de la exportación. El Project Ref es una confirmación del operador; no una consulta infalible de identidad del servidor.

No completar mapas fila por fila: la asignación total ya fue autorizada. Esta variante construye ambos mapas desde los IDs actuales bajo bloqueo exclusivo y utiliza exclusivamente el UUID autorizado de rochy-dev. Configuraciones/cuotas/pagos heredan la cadena del alumno. El dueño histórico no se infiere de actor_id.

Se regeneró la variante desde la 005 corregida: conserva revisiones durante el backfill de pagos. Además guarda firmas de los datos originales bajo bloqueo y las compara antes del commit, excluyendo únicamente propietario_id. Si varían IDs, datos financieros, timestamps, revisiones, actor_id o snapshots históricos, aborta. También comprueba que todas las filas tengan el dueño autorizado. No se crean/copían registros de negocio, no se habilita signup y no se alteran administradores.

## 3. Aplicación futura — no ejecutada por el asistente

Cuando se decida aplicar después de revisar el archivo, ejecutar **el archivo privado completo**, una sola vez, como postgres. No ejecutar 001–004 otra vez, no ejecutar la 005 genérica además de la privada y no ejecutar DEMO. Nunca aplicar fragmentos para saltar errores.

La transacción comprueba UUID/admin activo, conteos y restricciones; el timeout de adquisición de locks es de 10 segundos. Ante error, ejecutar ROLLBACK si la sesión sigue en transacción y revisar. Un error no se resuelve borrando filas o quitando restricciones. La migración es de una sola aplicación; no reintentar después de un resultado incierto sin comprobar primero si propietario_id ya existe.

Antes del commit se reactivan los triggers de auditoría/timestamps; los financieros permanecen activos todo el tiempo. Las RPC de datos mantienen SECURITY INVOKER, search_path vacío y autorización administrativa. Las nuevas filas toman auth.uid() por DEFAULT, RLS verifica propietario/admin y un trigger impide transferir dueño. Las FK compuestas impiden referencias cruzadas.

## 4. Verificar y reabrir la aplicación

Ejecutar [006-verificaciones-posteriores.private.sql](database/privado/006-verificaciones-posteriores.private.sql), de solo lectura:

- Conteos por dueño deben coincidir con la exportación y contener únicamente el UUID autorizado; tablas vacías no generan fila.
- Las tres comprobaciones de relaciones cruzadas deben devolver cero.
- Distribución de actor_id debe ser idéntica a la exportación.
- Las cuatro RPC de datos deben indicar security_definer=false; auditar conserva SECURITY DEFINER como antes.
- Triggers de auditar, marcar_actualizacion, propietario_inmutable y validación financiera deben estar habilitados; inspeccionar las políticas de propietario y aislamiento_obligatorio.

Cerrar sesión y recargar completamente todas las pestañas antes de volver a entrar. El servidor no puede retirar datos ya descargados por clientes anteriores. Dashboard usa la lectura financiera filtrada; no requiere cambios de cálculo ni filtros de seguridad en Angular. La generación toma alumnos/configuraciones propios, huella ligada al UUID y bloqueos por usuario/período.

## Pruebas con dos administradores, sin DEMO

1. Usar dos cuentas Auth reales existentes y autorizadas, A y B, en perfiles de navegador distintos. No crear ni autorizar cuentas automáticamente. Si falta B, esa prueba queda pendiente hasta prepararla manualmente con autorización.
2. A debe ver sus datos existentes. B, si aún no tiene registros propios, debe ver estados vacíos, sin datos de A. Confirmar primero que ambos reciben true de es_administrador_actual: vacío por usuario sin autorización no prueba aislamiento.
3. Obtener un ID conocido de A, confirmar lectura positiva como A e intentar ese ID con la sesión real B mediante REST y RPC de lectura. Debe quedar oculto. Revisar alumnos, configuración, cuotas, pagos y Dashboard. No usar service_role ni JWT inventados para las pruebas HTTP.
4. Ejecutar opcionalmente [007-lecturas-dos-administradores.private.sql](database/privado/007-lecturas-dos-administradores.private.sql), completando UUID de B. Es solo lectura y termina ROLLBACK. Comprueba dos roles de cliente, RPC financiera, vista mensual, historial e identidad no autorizada. Usa identidad SQL simulada y NO sustituye el login/JWT real ni las llamadas HTTP.
5. Para escrituras y generación real, preparar después operaciones de prueba propias expresamente aprobadas: comprobar INSERT con dueño ajeno, UPDATE/DELETE de IDs ajenos, propietario inmutable, RPC de guardado ajena, vínculos cruzados, huella de otro usuario y concurrencia. El guion transaccional `prueba-aislamiento-usuarios.sql` termina ROLLBACK, pero requiere candidatos propios de ambos y puede consumir valores de secuencia; no se ejecuta automáticamente. Sin esos controles positivos no marcar la validación de escritura/generación como completada.
6. El verificador HTTP de escritura anterior **mantiene su bloqueo de rochy-dev**: no quitarlo ni ejecutarlo aquí a ciegas. Los intentos destructivos sobre fixtures, si la seguridad fallara, podrían modificar registros. En esta preparación no se ejecuta ninguna prueba remota de escritura.

## Validación realizada en esta revisión

En PostgreSQL embebido local se ejecutaron exportación mínima, variante privada completa y verificaciones 006/007, reemplazando el UUID de rochy-dev por UUID sintéticos antes de ejecutar. Pasaron controles de asignación total y conservación del actor original de otro usuario. La suite PostgreSQL local de la 005 genérica también pasó aislamiento, RPC, historial y reglas financieras. No se ejecutó nada en Supabase; no se cambió Angular, credenciales, datos remotos ni signup. Sin commit, push ni deploy.
