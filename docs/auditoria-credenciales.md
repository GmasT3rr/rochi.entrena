# Auditoría local de credenciales — 22 de octubre de 2026

Resultado: no se detectaron credenciales secretas en el contenido revisado. Desde el punto de vista de exposición de credenciales, el próximo commit puede incluir la configuración pública actual. Esto no certifica la seguridad de la aplicación ni autoriza usar datos reales.

## Alcance

Se inspeccionaron 86 archivos de texto del workspace, 112 archivos generados en `dist` y `.angular` y 81 blobs únicos de los tres commits alcanzables mediante las referencias Git locales. Se revisaron `git status`, `git ls-files`, nombres históricos y los archivos seguidos que ahora coincidirían con exclusiones (ninguno). Se excluyó el contenido de dependencias en `node_modules`; las coincidencias relevantes en el SDK precompilado de `.angular` fueron revisadas.

La revisión combina búsqueda de formatos conocidos de claves privadas, tokens, JWT, URLs con credenciales y asignaciones de contraseñas con inspección de configuración y coincidencias. No prueba la ausencia de cualquier secreto arbitrario u ofuscado. No abarca secretos en GitHub/Supabase remotos, logs remotos, almacenamiento del navegador, objetos Git no alcanzables ni archivos fuera del proyecto.

## Archivos con configuración, URLs o referencias a credenciales

| Archivos | Contenido y clasificación |
| --- | --- |
| `src/app/core/auth/supabase.config.ts` | Exactamente dos propiedades literales: `url` y `publishableKey`. URL HTTPS de proyecto Supabase y clave con formato `sb_publishable_...`, ambas públicas. No hay service_role, secret key, contraseña ni token privado. Actualmente sin seguimiento; debe incluirse al preparar el commit de Auth. |
| `src/app/core/auth/auth-runtime.ts`, `auth-service.ts`, `auth.spec.ts`; `src/app/features/login/login.ts`, `login.html` | Referencias al SDK, campos de contraseña y sesión y casos de prueba. No contienen credenciales secretas literales. Contraseñas y tokens de sesión reales son secretos en ejecución. |
| `.github/workflows/deploy-pages.yml` | Configuración de Actions, permisos y ruta de Pages. No contiene credenciales Supabase ni secretos literales. Usa los mecanismos de autenticación de GitHub para Pages. |
| `angular.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `.editorconfig`, `.prettierrc` | Build, dependencias y referencias públicas a registros/esquemas. Sin credenciales detectadas. |
| `.vscode/extensions.json`, `.vscode/launch.json`, `.vscode/tasks.json` | Extensiones, tareas y URL local del navegador. Sin credenciales. |
| `src/index.html` | Enlaces públicos a fuentes y recursos. |
| `README.md`, `docs/autenticacion.md` | URLs públicas de Pages/localhost/documentación e instrucciones de configuración. No contienen valores secretos. |
| `docs/database/diseno-postgresql.md`, `docs/database/rochy-propuesta.sql` | Roles y referencias a service_role/Auth, sin valores de credenciales. No se ejecutó SQL. |
| `docs/cuentas-y-pagos.md`, `docs/exportaciones-y-respaldos.md`, `src/app/core/services/respaldo-service.spec.ts` | Documentación y pruebas de datos/respaldo; no se detectaron secretos. |
| `dist/rochy-hub/browser/main-*.js` | El build nuevo incluye Project URL y publishable key, como corresponde a una app cliente. No se detectaron secretos. |
| `.angular/cache/**` | SDK generado y mapas de fuentes. Las coincidencias fueron ejemplos/comentarios y nombres de eventos del SDK; no credenciales del proyecto. No se versiona ni se publica como artefacto de Pages. |

Se revisó también el resto de `src`, `public`, documentación y configuración del proyecto. Las menciones de `service_role` en comentarios y SQL no constituyen una clave service_role.

## Corrección aplicada

Se amplió `.gitignore` para excluir `.env`, `.env.*`, `*.local`, variantes `*.private`, logs, archivos de credenciales habituales, claves/certificados privados y carpetas locales de AWS/Supabase. Se permiten las plantillas `.env.example`, `.env.template` y `.env.sample`: deben contener únicamente ejemplos sin secretos.

Se mantienen versionables `supabase.config.ts`, Angular, package-lock y el workflow. `dist`, `node_modules` y la caché Angular continúan ignorados. Se comprobó el resultado con `git check-ignore` y `git ls-files --cached --ignored --exclude-standard`.

`.gitignore` evita agregar archivos nuevos por defecto; no elimina contenido seguido por Git ni impide que Angular empaquete un secreto importado o copie un archivo colocado en `public`. Nunca colocar credenciales privadas en fuentes, assets ni configuración del cliente, aunque estén ignoradas.

## Git e historial

No se detectaron secretos ni nombres de archivos sensibles seguidos por Git en el estado actual o en los tres commits disponibles. No se requiere retirar archivos del índice ni rotar credenciales por los hallazgos de esta auditoría.

Si en el futuro un archivo privado ya está seguido, agregar la exclusión y ejecutar `git rm --cached -- ruta/al/archivo` lo retira del índice conservando la copia local; después revisar el cambio preparado. Esto no borra versiones anteriores. Si contenía un secreto real, revocarlo/rotarlo primero en el proveedor: quitarlo del commit nuevo no resuelve una exposición histórica. Revisar cualquier saneamiento histórico por separado. No se ejecutó ninguna de estas acciones.

## Build y límites de la conclusión

Pasó `npm run build -- --configuration production --base-href /rochi.entrena/`, el comando del workflow. Se verificaron nuevamente los artefactos generados. El bundle inicial tiene 784,35 kB y genera una advertencia sobre el presupuesto orientativo de 500 kB; el build termina correctamente. El workflow conserva la publicación exclusiva de `dist/rochy-hub/browser`. No se ejecutó Actions remoto ni se desplegó.

La aplicación sigue pendiente de autorización administrativa, MFA/aal2 y pruebas RLS. No se modificó lógica de autenticación ni ABM. No se hicieron commits, push, modificaciones del índice ni reescrituras del historial.
