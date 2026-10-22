# Verificación de seguridad Supabase — 22/10/2026

## Resultado y alcance

**Verificación parcial: todavía no habilita migrar los ABM ni cargar datos reales.** Se ejecutaron solicitudes HTTP reales como cliente anónimo usando únicamente Project URL y publishable key del proyecto configurado. No se ejecutaron mutaciones, SQL ni operaciones de administración de usuarios. La RPC y el ingreso del administrador funcionan según lo informado por el usuario; esta ejecución no reutilizó esa sesión del navegador.

No se dispone de una cuenta no administrativa ni de credenciales de las cuentas de prueba. No se solicitaron contraseñas por chat. Las comprobaciones autenticadas y de escritura están preparadas, pero pendientes de ejecución local.

## Pruebas ejecutadas contra la API

Comando: `node scripts/verificar-supabase.mjs`. Se utiliza fetch con tiempo límite y sin redirecciones, sin service_role, SQL Editor ni JWT inventados. No imprime cuerpos de errores, emails, contraseñas ni tokens.

| Solicitud real | Resultado observado | Conclusión |
| --- | --- | --- |
| GET `/auth/v1/settings` | `disable_signup: true` | Registro público deshabilitado en la configuración expuesta por Auth. No se intentó registrar usuarios. |
| Misma configuración | Email habilitado; usuarios anónimos deshabilitados; `mailer_autoconfirm: false` | Estos son los valores públicos observados; no equivalen a una revisión de todos los ajustes del Dashboard. |
| POST RPC `es_administrador_actual`, sin sesión | HTTP 401, código 42501 | Ejecución anónima denegada. |
| GET `alumnos`, `configuraciones_mensuales`, `cuotas`, `pagos`, sin sesión | Cada una HTTP 401, código 42501 | Lectura anónima denegada por permisos. No fue una consulta vacía tomada como prueba positiva. |
| GET `administradores` con Accept-Profile `rochy_privado` | HTTP 406, código PGRST106 | Data API rechazó el esquema privado solicitado. |

No se deduce de estos resultados que las escrituras o el rol authenticated estén correctamente protegidos: deben probarse por separado. Los permisos de tabla y RLS son capas diferentes.

## Revisión del código y configuración Auth

Se revisaron `auth-runtime.ts`, `auth-service.ts`, `admin-authorization.ts`, `auth-guard.ts`, `auth.spec.ts`, rutas, login, layout y SQL local de autorización. La configuración cliente usa únicamente Project URL y clave `sb_publishable_...`; el verificador rechaza otro formato y solo envía credenciales a la URL HTTPS configurada de Supabase. El SDK conserva/restaura sesión y renueva tokens; no hay registro público en la UI. Los callbacks se procesan antes del router hash. No se modificó este comportamiento.

Las cuatro rutas del panel tienen guard de entrada y de hijos. La RPC sin argumentos debe devolver exactamente true; false, errores, respuestas vacías o ambiguas bloquean. No se usa user_metadata para dar administración. El contenido del panel no se muestra mientras se verifica; revalida al navegar. Las respuestas de otro access token no habilitan una sesión nueva. No hay comprobación continua en reposo: un corte de red o una desactivación se detectan al efectuar la próxima verificación; la UI no constituye seguridad de datos.

Se agregaron pruebas locales para pérdida de conexión después de una autorización válida y aborto/timeout. Son simulaciones de red del guard, no pruebas remotas de RLS. MFA/aal2 sigue pendiente. Los ABM continúan locales, compartidos por navegador/origen, sin aislamiento por cuenta.

Validación final ejecutada: `npm test -- --watch=false` terminó con **96 tests aprobados en 7 archivos**. `npm run build -- --configuration production --base-href /rochi.entrena/` terminó correctamente; conserva la advertencia de presupuesto del bundle inicial (786,58 kB frente a 500 kB orientativos). No se hicieron commits, push ni despliegues.

Quedan por revisar **manualmente en el Dashboard**: Site URL y lista exacta de Redirect URLs (sin comodines amplios), SMTP y plantillas, política de contraseñas y protección de contraseñas filtradas si está disponible, límites de Auth, duración/revocación de sesiones, proveedores habilitados y alertas de seguridad. El endpoint público no permite auditar todos estos valores. No se cambiaron ajustes remotos. Referencias: [configuración de Auth](https://supabase.com/docs/guides/auth/general-configuration), [seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api).

## Crear manualmente la cuenta pendiente

En Supabase, Authentication → Users → Add user → Create new user. Usar un correo de prueba bajo tu control y contraseña exclusiva; confirmar el correo por el mecanismo previsto por el proyecto. No activar registro público. **No agregar el UUID de esta cuenta a `rochy_privado.administradores`**. No darle permisos vía metadata. La RPC de esta cuenta debe devolver false; el administrador de prueba debe obtener true. Evitar probar con la cuenta administrativa personal de producción.

## Ejecutar la matriz completa con sesiones reales

1. En un entorno de pruebas, revisar y ejecutar manualmente `docs/database/fixtures-api-rls.sql`. Solo crea un alumno, una cuota y un pago sintéticos persistentes; no toca RLS ni usuarios. Guardar el ID `tcf-rls-audit-UUID` del NOTICE. El script transaccional anterior con ROLLBACK no sirve para estos HTTP, porque los fixtures deben estar confirmados y visibles en otras conexiones.
2. En una terminal local interactiva con Node 24, ejecutar `node scripts/verificar-supabase.mjs --full`. Solicita las dos cuentas y contraseñas ocultas, y el ID del fixture. Las contraseñas no se pasan como argumentos, no se guardan en archivos y los tokens se mantienen solo en memoria. No ejecutar con grabación de terminal ni copiar datos de sesión a documentación.
3. Verificar resultados PASS para RPC true/false y lectura positiva de los tres fixtures por el administrador. Si falta el fixture, su marcador o sus relaciones, la prueba se interrumpe: una consulta vacía no demuestra autorización.
4. El script prueba SELECT, INSERT válido, PATCH y DELETE de alumnos/cuotas/pagos como anon y no administrador. PATCH/DELETE con cero filas solo pasan si la sesión administradora confirma que los tres fixtures permanecen exactamente intactos. Para pagos, el trigger puede denegar antes de RLS por no ver la cuota; se reconoce únicamente el error específico esperado. Otros errores, restricciones o HTTP 404/500 no se aceptan como prueba de seguridad.
5. Para los tres roles comprueba esquema privado inaccesible e intentos POST/PATCH/DELETE de administradores. Las mutaciones privadas usan un UUID centinela, no una cuenta real, y deben rechazarse a nivel API; cero filas con éxito no se considera suficiente. No se intenta modificar una membresía existente.

**Límite de seguridad del modo --full:** solo usar fixtures desechables. Si hay una vulnerabilidad, un DELETE podría eliminar el fixture o un INSERT podría crear otro registro de prueba. El script se detiene ante un resultado inesperado y no modifica políticas ni limpia registros automáticamente. No apunta mutaciones a datos de negocio reales; el operador revisará cualquier remanente. La eliminación de datos reales y la limpieza destructiva están excluidas.

No se ejecutó el modo --full en esta revisión. Se prepararon pruebas de administrador autorizado como control positivo de RPC/lectura; su CRUD completo y reglas financieras no forman parte de esta comprobación negativa.

## Pendientes y criterio para continuar

| Prueba | Estado |
| --- | --- |
| Lecturas anónimas y RPC/esquema privado | Ejecutada por HTTP; denegadas |
| Registro público deshabilitado | Observado en settings real |
| Login/RPC administrador | Informado por el usuario; pendiente repetir con el verificador |
| No administrador: RPC false y acceso UI denegado | Pendiente crear cuenta y ejecutar |
| Anon/noadmin: INSERT/UPDATE/DELETE y control de integridad | Preparada en --full, no ejecutada |
| Tres roles: mutaciones de administradores rechazadas | Preparada en --full, no ejecutada |
| Navegación con RPC sin conexión/timeout | Tests locales; pendiente repetir en navegador bloqueando la RPC |
| Baja administrativa con JWT ya emitido | Pendiente, según procedimiento de autorización existente |
| Revisión de todo Auth y SQL/RLS realmente instalados | Pendiente Dashboard/operador; los archivos locales no prueban el estado remoto |

Para la comprobación visual de red: iniciar sesión como admin, abrir herramientas de red y bloquear la RPC, después navegar a otra sección. El contenido debe ocultarse y terminar en acceso no autorizado. Quitar el bloqueo y reintentar. No compartir headers Authorization. Registrar resultados del modo --full sin credenciales en este documento antes de considerar la migración de ABM.
