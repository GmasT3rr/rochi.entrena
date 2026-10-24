> Procedimiento actual: [aplicar-005-sql-editor.md](aplicar-005-sql-editor.md). Por nueva decision del usuario se prepara aplicacion directa en rochy-dev con exportacion minima, sin exigir Docker ni otro proyecto. Este documento conserva el procedimiento anterior como referencia.

# Asignación total autorizada de rochy-dev

El usuario autorizó explícitamente asignar todos los datos actuales de prueba de rochy-dev a un único UUID indicado por él. Esta decisión aplica a alumnos, configuración, cuotas, pagos y TODO el historial existente; no se deduce del actor histórico.

Se prepararon tres archivos privados, excluidos de Git, en `docs/database/privado/`:

1. `001-verificar-usuario-conteos.private.sql`: solo lectura. Muestra la referencia/URL esperadas según la configuración local, el usuario Auth con su email y estado administrativo, conteos de las cinco tablas y distribución de actor_id histórico. La referencia mostrada es el destino esperado, **no prueba la identidad real del servidor**: cotejar el Project Ref en Supabase Dashboard antes de ejecutar.
2. `002-generar-mapas.private.sql`: solo lectura. Tras la verificación de Auth/administración, devuelve ambos mapas JSON de todos los IDs actuales con el UUID autorizado. Guardar el valor JSON en un archivo privado si se necesita revisar entrada por entrada. No cambia filas ni actores. La existencia del UUID en Auth remoto no fue comprobada desde esta sesión: requiere ejecutar el primer archivo y revisar su resultado.
3. `005-todos-a-propietario.private.sql`: variante completa de 005 para revisión. Requiere completar Project Ref y el JSON de conteos aprobados. Bajo bloqueo exclusivo compara los cinco conteos, valida usuario/admin y construye los dos mapas desde los IDs actuales. Asigna propietario al alumno y su cadena de configuración/cuotas/pagos; el historial recibe dueño sin modificar actor_id, anterior ni nuevo. No borra ni duplica registros. Usa las mismas políticas, RPC y defensas de 005 genérica.

## Orden obligatorio

- Primero ensayar la **005 genérica** sobre un proyecto Supabase aislado y una copia revisada, usando UUID de cuentas de ese proyecto; nunca reutilizar el UUID reservado a rochy-dev. El proyecto/cuentas aún no fueron preparados.
- En rochy-dev solo se autoriza por ahora la comprobación de lectura: ejecutar manualmente 001 tras cotejar Project Ref; debe retornar exactamente el usuario previsto con el email correcto y administrador_activo=true. Si falta o no está autorizado, detenerse: estos scripts no lo crean ni lo habilitan.
- Solo tras esa verificación, ejecutar manualmente 002 para obtener JSON reales; no se inventaron IDs ni conteos en los archivos preparados.
- Revisar el SQL 005 privado, completar los dos parámetros de confirmación y conservarlo sin ejecutar. Aplicarlo a rochy-dev requiere terminar el ensayo aislado y una aprobación posterior del usuario.
- Si cambia algún conteo entre inventario y aplicación, la variante aborta y exige revisar nuevamente el estado. Acordar también una ventana sin modificaciones y respaldo verificado. Un error exige ROLLBACK; no ejecutar fragmentos.

## Validación local realizada

La variante SQL completa se ejecutó en PostgreSQL embebido local, reemplazando **antes de ejecutarla** el UUID reservado a rochy-dev por uno sintético. Se verificó que confirmaciones vacías abortan, que la asignación total toma los IDs existentes y que actor_id y snapshots históricos de otro actor permanecen idénticos. Pasaron cuatro pruebas de estructura/mapas adicionales.

No hubo conexiones ni modificaciones a rochy-dev ni a Supabase. No se comprobó todavía la existencia real del UUID, ni los conteos remotos, ni el aislamiento con dos cuentas reales. No hubo cambios Angular, credenciales, commit, push ni deploy.
