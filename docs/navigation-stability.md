# Estabilidad de navegación y autorización

## Causa reproducida

El componente que desaparecía era el hijo del router-outlet de AdminShell. El layout conserva ese outlet solamente cuando AdminAuthorization.status() es authorized. Cada llamada a verify(), tanto desde sessionGuard como desde los repositorios, reemplazaba el permiso confirmado por checking. Angular retiraba el outlet y su pantalla; al recibir true los reconstruía.

El problema también afectaba navegaciones con datos en memoria: el guard siempre consulta es_administrador_actual. Al terminar la verificación podía reaparecer la pantalla anterior y luego cambiar al destino. La primera lectura del destino podía repetir el ciclo a través del repositorio. El skeleton no causaba este desmontaje.

Reproducción en Edge headless antes del cambio, respuestas simuladas de 140 ms:

| Tiempo desde carga | Estado del DOM |
| --- | --- |
| 1852 ms | El guard retira el outlet al navegar a Alumnos. |
| 2013 ms | Reaparecen outlet y Dashboard. |
| 2031 ms | El router activa Alumnos. |
| 2033 ms | La comprobación del repositorio vuelve a retirar el outlet. |
| 2180 ms | Reaparecen outlet y Alumnos. |

Además, AlumnosService reaccionaba a cualquier objeto de sesión nuevo, incluso con el mismo token, vaciando sus datos y reiniciando la carga. CuentasService ya distinguía ese caso.

## Corrección

- AdminAuthorization separa la solicitud en curso (`verifying`) del resultado confirmado (`status`). Una revalidación de la misma sesión conserva authorized hasta recibir el nuevo resultado. No se omite la RPC ni se introduce una caché que permita saltarla.
- Guards y repositorios siguen esperando verify() antes de activar destinos o consultar/escribir datos. Las verificaciones simultáneas comparten la promesa existente. Se conserva el timeout de diez segundos.
- Una respuesta false, un error, un cambio de token, recuperación de contraseña o cierre de sesión no heredan el acceso anterior. Las respuestas de sesiones antiguas no publican permisos.
- app.routes usa canActivateChild para todas las rutas protegidas. Se elimina la comprobación secuencial duplicada del padre en la entrada inicial. Las rutas públicas permanecen fuera del layout.
- AdminShell conserva el outlet durante revalidaciones del permiso confirmado. Denied/error tienen un mensaje de bloqueo y acceso a la pantalla existente de revisión, en lugar de parecer una comprobación infinita.
- AlumnosService ignora eventos repetidos del mismo token, igual que CuentasService. Un token diferente continúa invalidando los datos y permisos anteriores.

initializeAuth ya se ejecuta antes de bootstrapApplication y del router. Se conserva esa secuencia de restauración: no se introdujo un booleano de autenticación provisional ni se muestra contenido protegido antes de la confirmación inicial. No había animaciones de navegación que explicaran el desmontaje.

No se modificaron Supabase Auth, PostgreSQL, RLS, repositorios, reglas financieras, sidebar ni estilos. Se conserva MinimumLoading: consultas inmediatas, mínimo visual inicial de 750 ms y sin skeleton forzado en navegación con datos disponibles. No hay temporizadores nuevos de navegación ni CSS para esconder el fallo.

## Verificación real

- Suite Angular completa: 318 pruebas en 38 archivos, todas correctas, incluyendo autenticación, autorización, cierre/restauración de sesión, finanzas, cobros directos y skeletons.
- navigation-stability.spec verifica identidad del outlet y pantalla durante un guard pendiente, ausencia de construcción anticipada, retirada ante revocación y configuración de protección de rutas.
- auth.spec verifica revalidación pendiente, espera efectiva del guard y del repositorio, deduplicación concurrente y rechazo de respuestas de una sesión antigua.
- alumnos-supabase.spec verifica que un evento repetido de sesión no borra datos ni filtros ni dispara otra consulta.
- Navegador Edge headless con App, configuración de rutas, AuthService, AdminAuthorization, servicios y repositorios reales. Se sustituye únicamente el cliente SDK por respuestas simuladas; no se accede al proyecto Supabase ni se usan credenciales reales.
- Login mediante formulario, primera entrada a Dashboard, Dashboard → Alumnos → Cuotas, ficha personal/financiera, navegación repetida y menús a 375 y 1440 px; navegación rápida; evento de sesión repetido; autorización lenta de 1200 ms; error de datos con reintento; revocación administrativa; error de autorización; logout; entrada directa/restauración en Cuotas, Dashboard y Alumnos.
- Muestreo por requestAnimationFrame y observación de mutaciones: cero frames con outlet/pantalla ausentes durante la navegación autorizada; misma identidad del layout y outlet; ningún frame con contenido protegido antes de autorizar; ningún error de ejecución. Después de denegación o error administrativo no queda contenido protegido.
- Build de producción correcto. Persiste la advertencia de presupuesto inicial: aproximadamente 911 kB frente al umbral de aviso de 500 kB.

Evidencia local en tmp/navigation-before.json, tmp/navigation-after-basic.json, tmp/navigation-results.json y tmp/navigation-after-375.png. Los harnesses y trazas están en tmp, ignorados por Git: no se agregaron trazas a producción ni se registraron tokens, contraseñas o datos reales.

La reproducción y la corrección están confirmadas con respuestas simuladas y componentes reales, tanto en primera entrada como en navegaciones posteriores. No se comprobó una sesión autenticada contra el servidor Supabase real. La renovación con un token distinto conserva deliberadamente la invalidación estricta de permisos; no se promete conservar el contenido de una sesión que todavía no fue autorizada.

No se hicieron commits, push ni despliegues.
