# Respaldo lógico antes de 005

## Estado actual

**NO se generó todavía un backup remoto.** Faltan Supabase CLI, Docker y la contraseña local de conexión. Solo se preparó `scripts/backup-rochy-dev.ps1` y se comprobó su sintaxis PowerShell; no se ejecutó contra Supabase. No se aplicó 005, no se modificaron datos, no se creó otro proyecto y no hubo commit/push/deploy.

El script utiliza `supabase db dump`, que ejecuta las herramientas PostgreSQL en Docker. Referencias oficiales: [backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump). Se consultó la versión publicada 2.121.0; los comandos deben revisarse si cambia el CLI.

## Preparación en Windows

1. Instalar y abrir Docker Desktop con motor Linux según su instalador oficial. Verificar `docker info`. Esto no crea un proyecto Supabase ni inicia su stack local.
2. Instalar Supabase CLI siguiendo la [guía oficial](https://supabase.com/docs/guides/local-development/cli/getting-started). En Windows con Scoop ya instalado:

   ```powershell
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   supabase --version
   ```

   No usar `npm install -g supabase`. El script requiere el comando `supabase` disponible en PATH. No hace falta supabase login, link, init, start ni un token de Management API para este procedimiento con db-url.
3. En Dashboard, abrir **rochy-dev → Connect → Session pooler**, puerto **5432**, y verificar el Project Ref. Copiar una URI **sin contraseña**; por ejemplo:

   ```text
   postgresql://postgres.PROJECT_REF@HOST.pooler.supabase.com:5432/postgres?sslmode=require
   ```

   Usar HOST real de Connect; no asumir región. No usar el transaction pooler de 6543. La conexión directa `db.PROJECT_REF.supabase.co:5432` requiere conectividad adecuada (habitualmente IPv6). La Project URL y publishable key no sirven para pg_dump.
4. Tener la contraseña PostgreSQL actual. **No resetearla para este respaldo** ni enviarla por chat. Se introduce localmente mediante Read-Host -AsSecureString. No activar transcript, debug ni grabación de terminal; no pegar URIs con contraseña.
5. Elegir un directorio fuera de todo Git y preferentemente en un volumen cifrado con BitLocker/ACL apropiada. El dump de Auth puede contener hashes de contraseñas, tokens/sesiones y otros datos de autenticación: es confidencial, aunque la contraseña de conexión no se guarde. Un respaldo de identidades no equivale a un archivo libre de secretos.

## Ejecución local

Cerrar escrituras desde la app y otras sesiones; evitar también cambios Auth durante el respaldo. No hay polling ni bloqueo automático de escritores. Los datos se extraen en un único pg_dump para compartir snapshot entre negocio, historial y Auth; roles/estructura son dumps separados y requieren una ventana estable.

Desde una PowerShell local, en el repositorio:

```powershell
.\scripts\backup-rochy-dev.ps1
```

El directorio predeterminado será `%USERPROFILE%\TusCuentasFacilBackups\rochy-dev\FECHA-HORA`, fuera del repositorio. Opcionalmente pasar `-Destino` con una carpeta nueva externa; no se sobrescriben backups. El script comprueba el Project Ref contra la URL pública configurada, exige confirmar rochy-dev y la ventana sin escrituras, y pide la contraseña oculta. Esa comprobación confirma el destino esperado, no sustituye cotejar Project Ref en Dashboard.

La contraseña se comunica al CLI mediante variables de entorno temporales, nunca mediante argumentos, archivos de configuración o logs. Los mensajes completos del CLI se capturan y no se imprimen ni guardan para evitar exposición en errores; se limpia el entorno al terminar. Es memoria de proceso temporal, no aislamiento frente a un administrador local de la máquina. No compartir variables/dumps ni capturas con credenciales.

## Archivos esperados, todavía NO generados

| Archivo | Contenido |
| --- | --- |
| roles.sql | Roles personalizados exportables; no reemplaza los roles gestionados del destino Supabase. |
| schema.sql | Estructura de public y rochy_privado: tablas, constraints, índices, funciones, triggers ordinarios, grants y políticas RLS. |
| auth-schema-reference.sql | Estructura Auth como referencia de compatibilidad; NO aplicarla a ciegas sobre el esquema gestionado de Supabase. |
| data.sql | Un snapshot de public, rochy_privado y auth: alumnos, configuración, cuotas, pagos, administradores, historial con actor_id original e identidades Auth con sus UUID. Incluye otras tablas Auth exportables de ese esquema. |
| manifest.json | Tamaños, SHA-256, conteos por bloque COPY, Project Ref y estado de validación parcial. No contiene contraseña de conexión. |

El script verifica códigos de salida, archivos no vacíos, presencia de tablas/funciones/triggers/políticas y bloques COPY de las seis tablas de negocio/privadas más auth.users/auth.identities. Un COPY vacío es válido si realmente no había filas; verificarlo contra el inventario remoto. Si algo falta, aborta y no genera un manifest de respaldo confirmado. Los archivos parciales se conservan y siguen siendo confidenciales; no usarlos para restaurar ni aplicar 005 basándose en ellos.

### Revisión del validador antes de ejecutar

La validación offline se separó en `scripts/backup-validacion.ps1`. Acepta `CREATE FUNCTION` de pg_dump y `CREATE OR REPLACE FUNCTION` del posprocesamiento del CLI; también las dos formas de CREATE TRIGGER y tablas con/sin IF NOT EXISTS. Comprueba funciones concretas, las seis tablas esperadas, RLS habilitada en cada una y políticas/triggers en las tablas que los requieren. Administradores conserva RLS sin políticas de cliente, según el diseño original.

COPY se procesa como texto por bloques FROM stdin, respetando `\.` como terminador exacto. Admite identificadores citados o sin comillas y finales LF/CRLF; los escapes `\n`, `\t` y `\N` no crean filas adicionales. Rechaza cabeceras no reconocidas, bloques duplicados, falta de terminador y ausencia de Auth. No imprime filas del respaldo.

Se contrastaron los flags y el tratamiento de esquemas con el [código oficial del CLI](https://github.com/supabase/cli/blob/develop/apps/cli-go/pkg/migration/dump.go) y sus [scripts de dump](https://github.com/supabase/cli/tree/develop/apps/cli-go/pkg/migration/scripts): schema.sql solicita public/rochy_privado; Auth se solicita explícitamente para referencia estructural; el dump único de datos solicita public/rochy_privado/auth con --use-copy. El CLI excluye auth.schema_migrations, lo cual no excluye usuarios/identidades. El filtro explícito evita depender de las exclusiones por defecto.

Validación ejecutada: 13 comprobaciones offline sobre fixtures de formato pg_dump/CLI. Ejecutar con `.\scripts\backup-validacion.test.ps1`; no usa Docker, credenciales ni red. **No se ejecutó un pg_dump remoto ni se verificaron archivos reales del proyecto**. La presencia/conteos efectivos de Auth y las otras tablas deben comprobarse cuando se genere el respaldo; las pruebas de fixtures no sustituyen esa comprobación ni la restauración.

## Comprobar el resultado

1. Verificar que existen los cinco archivos y el estado `ARCHIVOS_VERIFICADOS_RESTAURACION_PENDIENTE` en manifest.json. No confundirlo con restauración ensayada.
2. Recalcular `Get-FileHash -Algorithm SHA256` para los cuatro SQL y compararlos con el manifiesto. Revisar tamaños y fechas sin imprimir el contenido.
3. Comparar `tablas_copy` con los conteos del inventario privado de rochy-dev obtenido durante la misma ventana. Confirmar especialmente rochy_privado.historial y auth.users. Los esquemas gestionados de la estructura se excluyen normalmente: por eso Auth se exporta explícitamente y se verifica su presencia en data.sql.
4. Para acreditar recuperabilidad falta una restauración de prueba autorizada. En esta tarea no se crea ningún proyecto ni se ejecuta restauración.

## Restauración: plan, NO ejecutado

No ejecutar los SQL sobre rochy-dev automáticamente ni concatenar data.sql sobre filas existentes: puede fallar por duplicados, esquema distinto o duplicar operaciones de auditoría/pagos si se usan triggers incorrectamente. Restaurar datos pre-005 sobre tablas post-005 tampoco revierte la arquitectura. Tras un commit de 005, recuperar el esquema previo exige un plan de recuperación completo revisado por el operador. No usar db reset, DROP ni limpieza automática.

En un **destino de restauración expresamente autorizado**, compatible, preparado y sin colisiones de objetos/datos, seguir la guía oficial: revisar roles.sql, restaurar schema.sql, y cargar data.sql en una única transacción deteniéndose ante errores. El destino Supabase debe tener su esquema Auth gestionado y roles de plataforma correctamente provisionados; conservar UUID de auth.users y restaurar auth.identities junto con las referencias de negocio. auth-schema-reference.sql sirve para comparar versiones, no para sobrescribir Auth gestionado.

Ejemplo de secuencia oficial con psql y una URI de DESTINO sin password (no ejecutar ahora):

```powershell
# Introducir la contraseña de destino oculta en memoria como en el backup.
# URI_DESTINO no debe contener contraseña; PGPASSWORD temporal, sin logs.
psql --dbname $uriDestinoSinPassword --single-transaction --set ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql
```

Durante una restauración aprobada se omiten triggers de carga para no producir auditoría nueva ni alterar revisiones por cada pago restaurado; esto es restauración de operador, no cambio de RLS en la app. Revisar los privilegios por defecto y grants del destino, reactivar/verificar triggers, políticas, secuencias e identity; comparar conteos, saldos, IDs, fechas e historial. Probar login con Auth, autorización, aislamiento y RPC antes de reabrir escrituras. Un error exige detener el proceso, no quitar restricciones para continuar.

## Límites

- No es respaldo físico/PITR ni copia completa de todos los esquemas/extensiones del clúster. Se centra en los datos y objetos de esta aplicación y Auth.
- No incluye archivos de Storage, Edge Functions, configuración Auth/SMTP/proveedores/redirects, API keys, JWT signing keys, secretos de plataforma o claves de cifrado Vault. Si se usan datos cifrados por la plataforma, un dump lógico por sí solo puede no permitir descifrarlos; revisar la guía oficial antes de afirmar recuperabilidad.
- Algunas tablas de historial de migraciones gestionadas, objetos de extensiones, publicaciones y event triggers pueden excluirse por el CLI. Los triggers ordinarios del esquema Rochy sí deben figurar en schema.sql. Revisar customizaciones de Auth aparte.
- Las sesiones/tokens restaurados pueden no ser válidos bajo otras claves del proyecto; el respaldo de Auth conserva referencias/identidades, no garantiza continuar sesiones activas.
- Los checks de archivos y hashes detectan faltantes/corrupción; no prueban por sí solos que una restauración funcione. **No considerar listo el respaldo hasta generarlo, comprobar conteos y acordar la estrategia de recuperación.**
