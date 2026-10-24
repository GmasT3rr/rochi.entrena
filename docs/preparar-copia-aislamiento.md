> Procedimiento actual: [aplicar-005-sql-editor.md](aplicar-005-sql-editor.md). Por nueva decision del usuario se prepara aplicacion directa en rochy-dev con exportacion minima, sin exigir Docker ni otro proyecto. Este documento conserva el procedimiento anterior como referencia.

# Preparar 005 sin tocar rochy-dev

## Estado y correcciones

No se ejecutaron consultas ni migraciones contra rochy-dev ni contra ningún proyecto Supabase. No se cambiaron credenciales. La copia Supabase y las dos cuentas reales todavía no existen, según confirmó el usuario.

Se corrigió el delimitador `do $ begin` a `do $$ begin` y se eliminó el BOM del SQL. La ejecución en motor PostgreSQL también detectó que el UPDATE de propietario de pagos activaba validar_pago e incrementaba revision de la cuota. 005 ahora captura y restaura ese contador durante el backfill bajo bloqueo exclusivo, antes de reactivar auditoría/timestamps. No desactiva ni cambia los triggers financieros. El backfill no cambia importes, estados, fechas, IDs, timestamps, revisiones ni entradas históricas; solo agrega propiedad.

La comprobación de UUID se reforzó: además de existir en Auth, todos los propietarios indicados deben figurar como administradores activos. Si un dueño histórico debe ser una cuenta inactiva, esta versión se detiene: no reactivar ni reasignar automáticamente para sortearlo; revisar ese caso antes de ejecutar.

## 1. Crear el entorno aislado manualmente

1. Crear/restaurar un proyecto diferente, por ejemplo `rochy-aislamiento-pruebas`. Comprobar su **Project Ref y URL**, no solo el nombre. No reutilizar rochy-dev.
2. Para una copia fiel, usar el procedimiento oficial [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project) si está disponible. Es una copia de base: Auth settings/API keys y otros servicios necesitan configuración independiente. La disponibilidad puede depender del plan. No copiar credenciales a Angular ni enviar secretos por chat.
3. Si no está disponible, preparar un respaldo/restauración conforme a las herramientas oficiales con un operador de base de datos. No restaurar manualmente auth.users con INSERT inventados. Un proyecto vacío con el esquema 001–004 y cuentas nuevas sirve para ensayo funcional, **pero no demuestra que los datos reales de rochy-dev migran correctamente**. Esa prueba requiere una copia/restauración revisada de los existentes.
4. Mantener registro público deshabilitado y correos de prueba controlados. Revisar extensiones, funciones, triggers, políticas y versión PostgreSQL reales antes de 005. No volver a ejecutar el esquema original sobre una copia que ya lo contiene.
5. En Authentication → Users de la copia, crear manualmente dos cuentas de prueba A/B con contraseñas distintas. Anotar UUID y email, nunca contraseñas en los mapas. Un operador autoriza esos UUID como administradores activos en la tabla privada de **la copia**. No modificar usuarios ni permisos de rochy-dev.

## 2. Inventario de existentes, solo lectura

Ejecutar manualmente `docs/database/inventario-propietarios.sql` como operador confiable. Tiene una transacción REPEATABLE READ READ ONLY y retorna una celda JSON con usuarios/email/autorización, alumnos, relaciones financieras contadas e historial completo anterior/nuevo. No incluye hashes de contraseñas ni tokens.

Exportar el valor JSON de la celda, no el envoltorio CSV/array de resultados, a `inventario.private.json`. Contiene datos personales: guardarlo en un directorio privado. Para preparar la asignación real se puede obtener este inventario de rochy-dev mediante lectura autorizada; **no ejecutar allí 005 ni DEMO**. Hacer el ensayo de escritura sobre su copia aislada.

Revisar cada alumno con el responsable del negocio. Para cada entrada histórica, inspeccionar tabla, registro_id, operación, snapshots y fecha; actor_id indica quién operó, no a quién pertenece el registro. Incluso con el mismo registro_id, una fila borrada pudo reutilizarse. No se adivina propiedad y no se propaga automáticamente desde el actor o email del alumno.

## 3. Crear y completar los mapas

Desde el repositorio:

```powershell
node scripts/preparar-propietarios.mjs plantilla C:/privado/inventario.private.json C:/privado/mapas.private.json
```

La herramienta copia únicamente IDs y deja **todos** los propietario_id en null. Un operador debe reemplazarlos uno por uno por UUID aprobados. Los dos arrays son:

```json
{
  "alumnos": [{"alumno_id":"ID_EXISTENTE","propietario_id":"UUID_APROBADO"}],
  "historial": [{"historial_id":"123","propietario_id":"UUID_APROBADO"}]
}
```

Los ID históricos se conservan como texto para no perder precisión de bigint. Configuraciones, cuotas y pagos actuales heredan la cadena del alumno; no tienen mapas independientes. Si un alumno realmente era compartido, resolver su único propietario explícitamente; esta migración no duplica registros.

Validar y producir una copia SQL privada:

```powershell
node scripts/preparar-propietarios.mjs validar C:/privado/inventario.private.json C:/privado/mapas.private.json C:/privado/005-revisada.private.sql
```

Se comprueban cobertura completa, IDs inexistentes/duplicados y UUID con email/administración activa en el inventario. No se sobrescriben archivos. El SQL generado escapa comillas de los IDs y conserva 005 original sin mapas reales. Los nombres `.private.json` y `.private.sql` están excluidos por .gitignore. No subirlos aunque no contengan contraseñas.

Antes de ejecutar, cotejar en la **copia destino** cada UUID con su email y autorización actual. Un inventario viejo no acredita vigencia. 005 vuelve a consultar auth.users/administradores y aborta ante UUID inexistente, no autorizado o mapas incompletos. No omitir esta revisión si el destino usa cuentas/UUID distintos del origen.

## 4. Ensayo con la copia real

1. Respaldar la copia y registrar conteos/contenido de tablas, timestamps y revisiones. Revisar la copia SQL generada.
2. En ventana sin escritores de la copia, ejecutar MANUALMENTE 005-revisada.private.sql como postgres. Comprobar el Project Ref antes de cada ejecución. No ejecutarla en rochy-dev. Si falla, ROLLBACK y revisar; no aplicar fragmentos.
3. Comparar todos los datos salvo la nueva columna propietario_id, incluyendo historial; confirmar triggers activos. Nunca omitir errores de restricciones. No borrar filas para que el ensayo pase.
4. Revisar el embed de configuraciones, las RPC y las consultas del Dashboard a través de la app apuntando **solo en un entorno local de prueba separado** a la copia. Este trabajo no cambia la configuración actual de Angular ni sus credenciales.
5. Abrir sesiones A/B en perfiles separados. A solo ve sus alumnos/cuotas/pagos y su Dashboard; B ve los suyos. Cambiar de cuenta no debe mostrar datos anteriores. Probar alta/edición/estado, configuración mensual y RPC de guardado con IDs propios/ajenos.
6. Ejecutar el verificador HTTP preparado:

   ```powershell
   node scripts/verificar-aislamiento.mjs --confirmar-proyecto-pruebas
   ```

   Ahora pide URL y publishable key de la **copia** sin editar archivos de credenciales y rechaza el host actualmente configurado en Angular. Solicita contraseñas ocultas de A/B. Crear previamente los dos fixtures con UUID explícitos usando fixtures-api-rls.sql de la copia. Solo se deben usar fixtures desechables: si las políticas son defectuosas, un intento de escritura podría modificar el fixture. No ejecutarlo sobre datos operativos.
7. Ejecutar `prueba-aislamiento-usuarios.sql` en la copia, completando UUID/período; termina ROLLBACK. Verifica historial con controles positivos y bloqueos de escritura privada. No reemplaza las llamadas HTTP.
8. Confirmar generación mensual por la API/UI con ambos usuarios, comparar antes/después del otro dueño y probar dos sesiones simultáneas del mismo usuario. Probar pagos concurrentes, sobrepagos, reducción bajo lo abonado, duplicados y DELETE con pagos. Los bloqueos multiconexión no se probaron en PostgreSQL embebido.

## 5. DEMO original de seis meses

`docs/database/demo-seis-meses.sql` requiere 005, UUID explícito y la frase de confirmación del destino aislado. Verifica usuario Auth/administración y hace inserts como authenticated a través de RLS. No busca al primer usuario ni se ejecuta desde Angular.

Genera un lote nuevo identificado, sin borrar/actualizar existentes: 8 alumnos, 8 configuraciones, 48 cuotas y 48 pagos en los seis meses argentinos hasta el actual. Incluye modalidades, activos/pausado/inactivo, cuotas sin pago, pagos completos/parciales y múltiples abonos, vencimientos ajustados e importes históricos distintos. Los pagos no son futuros. Reejecutarlo crea otro lote: revisar antes de confirmar. No implementa limpieza automática.

## Pruebas realizadas

Se ejecutó `scripts/probar-005-postgres.mjs` sobre **PostgreSQL 18.6 embebido, PGlite 0.5.11**, solo memoria local. Se instalaron herramientas en tmp ignorado, sin modificar package.json/package-lock.json de Angular:

```powershell
npm install --prefix tmp/aislamiento-tools --no-save --package-lock=false @electric-sql/pglite@0.5.11
node scripts/probar-005-postgres.mjs
```

El motor ejecutó esquema original y 001–005, rollback ante mapas vacíos, preservación íntegra del backfill, dos identidades SQL authenticated, aislamiento de tablas/historial/RPC/generación, vínculos cruzados rechazados, propietario inmutable, sobrepago/reducción/borrado con pagos rechazados y administrador desactivado. También ejecutó inventario y DEMO, comprobando seis períodos, cantidades y ausencia de cambios al otro dueño.

Es ejecución SQL real, no un parser ni un mock del motor. **Auth y roles mínimos son fixtures locales**, no cuentas Supabase reales; no es una copia del proyecto existente ni acredita compatibilidad con su versión/configuración exactas. [PGlite](https://pglite.dev/docs/) usa una conexión: no prueba concurrencia multiconexión, PostgREST ni login/JWT reales. Esos ensayos y el Dashboard visual siguen pendientes de crear la copia y las cuentas A/B. No se autoriza todavía una migración sobre rochy-dev.
