# Autorización administrativa

Resultados de las solicitudes HTTP reales y pendientes actuales: [verificación de seguridad Supabase](verificacion-seguridad-supabase.md). La RPC ya está instalada según lo confirmado por el usuario; no volver a ejecutar la migración 001.

Esta etapa reemplaza el acceso por mera sesión: el panel requiere que la RPC devuelva exactamente el booleano `true`. No modifica ABM/localStorage, credenciales públicas, RLS ni incorpora MFA. Una cuenta Auth por sí sola no obtiene administración.

## SQL que ejecutar manualmente

En el SQL Editor del proyecto correcto, como `postgres`, revisar y ejecutar **solo** `docs/database/001-autorizacion-administrativa.sql`. Es incremental y requiere la tabla y función privadas existentes; no ejecutar otra vez `rochy-propuesta.sql`. La migración crea `public.es_administrador_actual()` sin argumentos, establece propietario confiable y search_path vacío, revoca ejecución pública/anónima y permite ejecución a `authenticated`. Delega la consulta a `rochy_privado.es_administrador()` y exige `auth.uid()` no nulo. No expone filas, no acepta otro usuario y no cambia políticas de datos. No agregar `rochy_privado` a los esquemas expuestos de Data API.

La migración se aplica una vez. Si la RPC ya existe, revisar la definición instalada antes de modificarla: el script usa CREATE FUNCTION y no sobrescribe silenciosamente objetos existentes. Si falta la migración o hay errores de permisos/red, Angular falla cerrado.

La seguridad de funciones con SECURITY DEFINER requiere propietario confiable, nombres calificados, search_path controlado y grants explícitos; ver [documentación oficial](https://supabase.com/docs/guides/database/functions). La RPC es una comprobación de acceso; RLS sigue siendo la frontera de seguridad para los datos.

## Comportamiento Angular

`AdminAuthorization` consulta la RPC con el cliente Supabase existente. No usa user_metadata ni permite seleccionar un usuario. Los guards esperan el resultado al entrar al panel tras login, restaurar una sesión y navegar entre sus rutas. Se vuelve a consultar aunque la sesión sea la misma, para detectar administradores desactivados; solo se comparten solicitudes que siguen en curso. Los cambios de sesión invalidan el estado anterior y sus respuestas tardías no conceden acceso a otra sesión. Una consulta excedida de diez segundos o con formato ambiguo es un error que deniega acceso.

Mientras se comprueban permisos no se muestra el contenido del panel. Sin sesión se dirige a login; con sesión pero false/error se muestra “Acceso no autorizado”, con reintento y cierre de sesión. La recuperación de contraseña mantiene su flujo separado. No hay sondeo continuo: una baja administrativa se detecta en la siguiente navegación/verificación o cambio de sesión; RLS debe rechazar inmediatamente nuevas operaciones de datos independientemente de lo que muestre la interfaz.

## Verificación local y de PostgreSQL

`npm test -- --watch=false` cubre guard y servicio: sin sesión, true explícito, false para no administrador/desactivado, respuesta vacía/ambigua, error RPC/red, espera, nueva consulta en navegación y respuesta tardía de otra sesión. Son pruebas con respuestas simuladas; no verifican el servidor.

Se preparó `docs/database/prueba-autorizacion-rls.sql` para ejecutar **manualmente en un proyecto de pruebas**, después de aplicar la migración. Completar los UUID de dos cuentas Auth existentes: un administrador activo y una cuenta sin administración activa. No crea usuarios. Crea fixtures conocidos de las cuatro tablas, comprueba RPC/RLS como anon y authenticated, intenta lecturas, UPDATE, DELETE e INSERT de alumno, comprueba la tabla privada, verifica lectura y UPDATE positivos del administrador, desactiva temporalmente al administrador y repite denegaciones con las mismas claims. Al final verifica que los intentos denegados no alteraron los fixtures y ejecuta ROLLBACK. Ante cualquier error, ejecutar ROLLBACK antes de reintentar. No reemplazarlo por COMMIT.

Este script simula roles y claims desde una conexión de operador, no valida tokens emitidos ni el transporte HTTP. Tampoco cubre todas las combinaciones de INSERT, concurrencia o triggers financieros: ampliar esas pruebas antes de migrar los ABM. Una consulta vacía nunca se considera prueba positiva: el administrador debe recibir true y ver exactamente los fixtures sembrados.

## Sesiones reales

1. Con la migración aplicada y las cuentas preparadas por el operador, iniciar localmente con `npm start`. Sin sesión, abrir directamente `/#/dashboard`: debe terminar en login.
2. Iniciar sesión con la cuenta no administrativa: debe mostrar “Acceso no autorizado”. Probar rutas directas y recarga; no debe renderizar módulos del panel.
3. Iniciar sesión con el administrador activo: deben funcionar Dashboard, Alumnos, Cuentas y pagos y Configuración. Recargar y navegar de nuevo: cada navegación protegida debe comprobar permisos mediante `/rest/v1/rpc/es_administrador_actual`.
4. En herramientas de red, revisar únicamente nombre/estado/respuesta booleana de la RPC. No copiar headers Authorization, contraseñas, JWT, refresh tokens ni URLs de recuperación a documentos/logs.
5. El operador puede desactivar la cuenta de prueba en la tabla privada desde una conexión confiable. Sin cerrar esa sesión, navegar a otra sección: debe denegar. Reactivar según corresponda al finalizar. No se incluye una acción cliente para darse privilegios.
6. Simular falta de red o bloquear la RPC y navegar: acceso bloqueado, sin contenido del panel. Reintentar después de restaurar conexión. Cerrar sesión debe seguir llevando a login.
7. En un proyecto con fixtures conocidos, probar además peticiones Data API con clientes autenticados de cada rol y el cliente anónimo (solo publishable key). La cuenta autorizada debe poder leer el ID conocido; la no autorizada no debe leerlo, ni modificarlo o eliminarlo. Un UPDATE/DELETE puede responder éxito con cero filas por RLS: verificar desde la cuenta autorizada que el registro siga intacto. Los INSERT válidos sin permisos deben rechazarse. No usar service_role ni SQL Editor como prueba de una sesión real: pueden omitir RLS.

Repetir también con un JWT real de administrador luego desactivado para verificar que la autorización depende de la tabla, no de roles viejos del JWT. Los tests reales contra Supabase no se ejecutaron automáticamente. MFA/aal2, pruebas RLS completas y migración de datos siguen pendientes; usar únicamente datos de prueba.
