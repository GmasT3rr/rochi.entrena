# Autenticación preliminar

Se agregó Supabase Auth sin modificar los ABM ni sus datos en localStorage. No se ejecutó SQL ni se crearon usuarios. El panel ahora requiere además una autorización administrativa explícita por RPC; ver [autorización administrativa](autorizacion-administrativa.md) para aplicar manualmente la migración incremental y probarla. **MFA y validaciones reales siguen pendientes: usar únicamente datos de prueba.**

## Configuración

Completar `src/app/core/auth/supabase.config.ts` con Project URL (`https://<ref>.supabase.co`) y una clave `sb_publishable_...` obtenida en el proyecto Supabase. Son valores públicos incluidos en el bundle; nunca colocar service_role, secret keys, contraseñas PostgreSQL ni credenciales de usuarios. Se requiere recompilar después de cambiarlos. No se necesitan variables nuevas en GitHub Actions; el workflow conserva `/rochi.entrena/` como base href.

En Supabase Auth, mantener el registro público deshabilitado. Configurar Site URL como `https://gmast3rr.github.io/rochi.entrena/` y agregar esa URL exacta y `http://localhost:4200/` a Redirect URLs. El correo de recuperación debe conservar el enlace estándar de Supabase (`ConfirmationURL`). Configurar SMTP y la política de contraseñas según el proyecto.

## Hash y callbacks

`main.ts` espera la inicialización del SDK antes de arrancar Angular. El SDK restaura la sesión, intercambia códigos PKCE y consume callbacks. Nuevas solicitudes de recuperación usan PKCE y vuelven a la raíz publicada, sin `#/login` en redirectTo. Así no requieren una ruta física en Pages. Un enlace PKCE debe abrirse en el mismo navegador y origen desde el que se solicitó (allí reside el verificador).

Para enlaces heredados con tokens en el fragmento se selecciona el modo implicit del SDK antes de inicializarlo; no se extraen ni almacenan tokens manualmente. Tras procesar un callback de recuperación, se dirige a `#/login` para cambiar la contraseña. Si quedan parámetros de Auth, Angular no arranca y se conserva la URL para evitar perderlos con el router. No compartir URLs de callback. Los errores no se imprimen con tokens en consola. Una recuperación fallida requiere pedir otro enlace; volver manualmente a la raíz para hacerlo.

La recuperación permite solicitar un correo, cambiar la contraseña y cerrar la sesión local antes de volver a iniciar sesión. Su estado se conserva en sessionStorage para no saltar al panel al recargar esa pestaña. No implementa invitaciones.

## Prueba con la primera cuenta

Cuando el operador haya creado el primer administrador en Supabase y configurado su autorización por un procedimiento separado:

1. Completar la configuración pública, ejecutar `npm start` y abrir `http://localhost:4200/#/dashboard` sin sesión: debe ir a login.
2. Aplicar manualmente la migración de autorización. Probar credenciales incorrectas y después el email/contraseña del administrador activo. Debe abrir Dashboard; una cuenta sin permisos debe mostrar “Acceso no autorizado”.
3. Recargar y navegar por Alumnos, Cuentas y pagos y Configuración: debe mantenerse la sesión. Probar también las rutas directamente.
4. Cerrar sesión con el icono de salida: debe volver al login. Atrás y recargar no deben permitir navegar a una pantalla protegida.
5. Solicitar recuperación y abrir el correo en el mismo navegador; cambiar contraseña, iniciar sesión otra vez y probar un enlace vencido.
6. Repetir en un entorno servido bajo `/rochi.entrena/` y, cuando se autorice un despliegue, en Pages. Build: `npm run build -- --base-href /rochi.entrena/`.

## Pendientes y límites

- Validar contra el proyecto real la RPC administrativa y los guards implementados; no usan user_metadata ni infieren administración de la sesión.
- Incorporar enrolamiento/desafío TOTP y comprobación aal2, además de políticas que exijan MFA en el servidor.
- Ejecutar pruebas RLS con usuarios autorizados, no autorizados y anónimos antes de conectar los ABM a Supabase. Los guards de Angular no son una frontera de seguridad.
- Los ABM conservan datos locales compartidos por navegador/origen; cerrar sesión no elimina ni aísla esos datos. No cargar datos reales.
- Sesión persistente y renovación automática administradas por el SDK. El cierre afecta este navegador; no fuerza el cierre de otros dispositivos. La revocación no invalida inmediatamente JWT ya emitidos.
- Faltan pruebas de integración contra el proyecto real: credenciales, correo/SMTP, expiración/renovación, varias pestañas y callbacks en Pages. Los tests locales no sustituyen esas verificaciones.

Referencias: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [recuperación de contraseña](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
