# Rochy: propuesta PostgreSQL / Supabase

**Para revisión; SQL no ejecutado.** El archivo `rochy-propuesta.sql` define estructura, restricciones,
triggers y RLS para un proyecto Supabase nuevo. No conecta Angular, no importa datos ni crea usuarios.
Supone un único estudio con administradores que comparten acceso; no es un diseño multitenant.

## Tablas y relaciones

| Tabla | Clave y relación | Propósito |
| --- | --- | --- |
| `public.alumnos` | PK `id TEXT` | Datos actuales, modalidad, estado y fecha de ingreso. Baja lógica por `estado`. |
| `public.configuraciones_mensuales` | PK/FK `alumno_id → alumnos.id` | Cero o una configuración por alumno; habilitación, importe y día 1–31. |
| `public.cuotas` | PK `id TEXT`; FK `alumno_id → alumnos.id` | Una obligación con concepto, período, importe propio y vencimiento. |
| `public.pagos` | PK `id TEXT`; FK `cuota_id → cuotas.id` | Cero o muchos pagos por cuota; incluye importe, fecha, medio y observaciones. |
| `rochy_privado.administradores` | PK/FK `usuario_id UUID → auth.users.id` | Lista de usuarios Auth autorizados, con indicador de acceso activo. |
| `rochy_privado.historial` | PK autoincremental | Auditoría de altas, cambios y eliminaciones: valores anteriores/nuevos, actor y fecha. |

Todas las relaciones operativas usan `RESTRICT`; no hay borrados en cascada. Los IDs de negocio son
`TEXT` porque el código admite strings y los ejemplos antiguos usan IDs no UUID. Los registros nuevos
pueden seguir generando UUID como texto. Los IDs Auth sí son UUID; un alumno no se convierte en usuario Auth.

## Compatibilidad con la aplicación

Se revisaron `core/alumno.ts`, `core/cuentas.ts`, `AlumnosService`, `CuentasService`, los repositorios
de alumnos/cuentas/datos y las validaciones de respaldo.

- La futura capa de repositorios traducirá camelCase a snake_case: `alumnoId → alumno_id`,
  `cuotaId → cuota_id`, `fechaIngreso → fecha_ingreso` y `diaVencimiento → dia_vencimiento`.
- `configuracionMensual` se reconstruye desde la relación 0..1. Sin fila equivale a deshabilitada;
  no se rellenan precios de alumnos anteriores. Una configuración existente conserva importe y día
  válidos incluso deshabilitada, tal como ocurre hoy.
- Importes: dominio `importe_ars` basado en **NUMERIC**, positivo, máximo `999999999.99` y sin
  fracciones de centavo. No se utiliza flotante. A diferencia de `NUMERIC(11,2)`, el dominio no redondea
  silenciosamente valores con más precisión: los rechaza. La futura API debe tratar estos valores
  como decimales exactos y definir su serialización.
- Período: `YYYY-MM` del cliente se convierte en `DATE` del primer día del mes y se convierte de vuelta
  al leer. Fechas de negocio usan `DATE`; auditoría usa `TIMESTAMPTZ`. El día local para pagos es Buenos Aires.
- `proximaCuota` anterior se conserva opcionalmente en `proxima_cuota_original`, sin convertirlo en
  fuente de deuda. Próxima cuota real, saldo y estados continúan derivándose de cuotas y pagos.
- No se restringe el vencimiento al mes del período: actualmente la aplicación permite cuotas manuales
  con otra fecha. Tampoco se exige alumno activo para registrar una cuota manual o cobrar una deuda antigua.
- Las fechas reales y el rango 1900–9999 se validan en la base. Antes de una futura importación habrá
  que detectar registros antiguos que solo pasaron la comprobación superficial de formato de alumnos.

## Cuotas, pagos e historial

La clave única es `(alumno_id, periodo, concepto_clave)`, para cuotas manuales y masivas. El concepto
visible se conserva; la clave replica normalización NFD, eliminación de marcas de acento, whitespace
de JavaScript, trim y minúsculas. Esto evita duplicados incluso entre solicitudes concurrentes.
Antes de migrar se deben comparar casos Unicode contra `normalizarConcepto()` en la configuración
de locale del PostgreSQL elegido.

Cada cuota guarda su propio importe: cambiar la configuración mensual no actualiza cuotas ni pagos.
No hay triggers de generación automática ni cron. La futura operación masiva, llamada después de la
vista previa y confirmación, debe ejecutarse en una transacción: releer alumnos `Activo` con configuración
habilitada, usar **Cuota de entrenamiento**, ajustar el vencimiento al último día del mes y realizar
`INSERT ... ON CONFLICT ON CONSTRAINT cuotas_alumno_periodo_concepto_unique DO NOTHING`.
Debe devolver creadas/omitidas y exigir otra vista previa si cambian importes o elegibilidad desde la revisión.
La RPC de generación y su integración quedan para la implementación posterior; no están creadas en este SQL.

Los pagos parciales son filas independientes. Los triggers impiden sobrepago, reducir la cuota por debajo
del total abonado, trasladar una cuota a otro alumno, trasladar un pago a otra cuota y registrar pagos futuros.
También se mantienen inmutables las PK y el alumno de una configuración. Una revisión de la fila cuota
serializa operaciones financieras concurrentes; la futura API debe reintentar transacciones abortadas por
serialización/deadlock. No se guarda un saldo duplicado: se calcula como importe menos suma de pagos.

Los estados se derivan como hoy: saldo cero → Pagada; con saldo y vencimiento anterior al día local →
Vencida; con abonos → Parcial; resto → Pendiente. Ingresos se suman por fecha de pago.
No hay vista SQL pública con permisos de propietario que pueda saltarse RLS.

No se permite eliminar alumnos ni configuraciones desde el cliente: baja por estado y deshabilitación.
Se conservan las eliminaciones actuales de pagos y de cuotas sin pagos; la FK impide borrar cuotas con
pagos. El historial conserva snapshots de ediciones/eliminaciones y no admite escritura de clientes.
Las revisiones financieras internas **no generan entradas en el historial de cuotas** ni cambian su
`actualizado_en` si no se modifican datos de negocio. La auditoría `AFTER` compara snapshots excluyendo
`revision`, timestamps técnicos y `concepto_clave`; omite también UPDATE sin cambios reales.
Altas, ediciones de datos, eliminaciones permitidas y operaciones reales sobre pagos sí se auditan.
El trigger `BEFORE` solo consulta columnas base: la columna generada se inspecciona después de calcularse,
en `AFTER`. Este historial registra cambios desde su instalación; no reconstruye modificaciones anteriores.

## Seguridad y futuro login

RLS está habilitado en todas las tablas. `anon` y usuarios autenticados sin autorización no acceden a datos.
Las políticas de lectura, alta, edición y eliminación permitida requieren `es_administrador()`.
Esa función consulta una lista privada mediante `auth.uid()`, con `SECURITY DEFINER` y `search_path` vacío.
El script se instala como `postgres` y fija explícitamente ese propietario para el esquema privado,
sus tablas y las dos funciones `SECURITY DEFINER` (autorización y auditoría). No reciben parámetros
SQL ni construyen consultas dinámicas con entradas de usuarios. Se revoca el EXECUTE público y solo
se concede al cliente la comprobación de su propia autorización y la normalización sin acceso a datos.
Las funciones de trigger no se conceden como RPC. También se revocan permisos de clientes sobre las
secuencias privadas, evitando permisos heredados de los defaults de Supabase.
Los propietarios de funciones/tablas privadas deben permanecer confiables;
no se fuerza RLS al propietario porque las funciones de autorización y auditoría necesitan su acceso interno.

El esquema privado no debe incluirse entre los esquemas expuestos de la Data API. Se otorga únicamente
USAGE para las políticas y lectura del historial sujeta a RLS; administrar la lista de autorizados requiere
una operación confiable fuera del cliente. No hay autorización por email ni `user_metadata`, ni permisos
para autopromoverse. Registrar o iniciar sesión en Supabase Auth no convierte a nadie en administrador.
La lista comienza vacía: el primer administrador se habilitará manualmente tras aprobar el diseño y crear
su cuenta Auth. Desactivarlo revoca su acceso a los datos sin esperar un cambio de claims en el JWT.

Los roles de propietario y `service_role` pueden omitir RLS. Sus credenciales pertenecen exclusivamente
a entornos confiables; Angular utilizará una clave pública y la sesión Auth del administrador.
El historial privado podría consultarse mediante una futura RPC autorizada; aquí no se expone esa API.

## Revisión pendiente antes de ejecutar

Solo se efectuó revisión estática; **no se ejecutó ningún SQL**, ni siquiera contra una base local.
No se encontraron `psql`, `postgres`, `initdb`, `pg_ctl`, Docker ni Podman disponibles, ni una instalación
en las rutas habituales de PostgreSQL/Docker/Scoop/Chocolatey o servicios locales identificables.
No se instaló un motor, no se creó ningún usuario y no se conectó Supabase.

Se revisaron orden de creación, bloque transaccional, sintaxis, dependencias, políticas, permisos,
columnas generadas y orden de triggers. Esto no sustituye al parser ni a la ejecución del servidor.
Requisitos del proyecto de prueba: PostgreSQL >= 15 con UTF-8, rol instalador `postgres`, esquema
`auth` con `auth.users` y `auth.uid()`, roles Supabase `anon`/`authenticated`, y nombres de objetos libres.
El script no es idempotente. Una falla debe revertir la transacción completa; no continuar ejecutando
fragmentos después de un error. `rochy_privado` debe quedar fuera de los esquemas expuestos de la Data API.

Está preparado para **probarse en un proyecto vacío y aislado**, no se declara validado para producción.
Las siguientes comprobaciones reales siguen pendientes; usar datos sintéticos y sesiones autorizadas
de prueba, sin importar información real:

| Caso | Resultado esperado |
| --- | --- |
| Instalación completa | Creación y COMMIT sin errores de SQL, funciones, triggers o permisos. |
| Anónimo y autenticado no autorizado | Sin lectura/escritura de negocio ni historial, sin ejecutar funciones de trigger. |
| Administrador activo / desactivado | Acceso permitido / denegado con la misma identidad Auth. |
| Autopromoción | INSERT/UPDATE/DELETE de administradores rechazado desde clientes, incluso admin. |
| Seguridad privada | Sin acceso API al esquema privado; ACL/RLS impiden leer administradores y escribir historial o usar sus secuencias. |
| Cambiar alumno de cuota o cuota de pago | UPDATE rechazado aun si el nuevo padre existe y no hay pagos previos. |
| Padres ausentes e IDs modificados | FK o trigger rechazan la operación; ninguna relación queda huérfana. |
| Pagos parciales | Suma exacta, cuota pagada al completar el importe y sobrepago rechazado. |
| Reducir cuota | Permitido hasta total abonado inclusive; por debajo se rechaza. |
| Auditoría de pago | Alta/edición/eliminación real del pago registrada; cero UPDATE técnicos en historial de cuotas. |
| Edición de cuota y UPDATE sin cambios | Una entrada por cambio real de negocio; ninguna por no-op o revisión técnica. |
| Bajas y eliminaciones | Alumno/configuración no se borran; cuota con pagos no se borra; pago eliminado conserva snapshot en historial. |
| Fallas de validación | Ningún cambio de revisión, datos o historial queda confirmado parcialmente. |
| Pagos concurrentes | Dos sesiones que sumadas superan el saldo no pueden confirmar ambas. Probar READ COMMITTED y REPEATABLE READ. |
| Pago vs. cambio de importe / eliminación | Sin sobrepago ni pérdida de relaciones; reintentar transacción completa ante SQLSTATE 40001 o 40P01. |
| Duplicados manuales y masivos | Misma clave normalizada rechazada; ON CONFLICT omite la existente aun con dos sesiones concurrentes. |
| Normalización y formatos | Acentos/espacios Unicode como en Angular; rechazar importes fraccionarios, NaN/Infinity y fechas inválidas. |

Se mantiene la generación futura por confirmación; no se agregó una RPC. Sus cálculos de días 28/29/30/31
y detección de vistas previas obsoletas deberán probarse al implementar esa operación.
Las pruebas de RLS deben ejecutarse con roles/sesiones reales de cliente, no únicamente como `postgres`,
que omite RLS. El historial sigue permitiendo corregir o eliminar pagos según el ABM actual, con trazabilidad;
no se convirtió el modelo en un libro contable inmutable.

Referencias oficiales: [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security),
[funciones y privilegios](https://supabase.com/docs/guides/database/functions),
[seguridad de funciones PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html).
Para esta revisión: [columnas generadas](https://www.postgresql.org/docs/15/ddl-generated-columns.html),
[visibilidad en triggers](https://www.postgresql.org/docs/15/trigger-datachanges.html) y
[orden y permisos de triggers](https://www.postgresql.org/docs/15/sql-createtrigger.html).
