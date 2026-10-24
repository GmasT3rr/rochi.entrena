Alta con primera cuota
=====================

La opción «Crear primera cuota al guardar» aparece solamente en alumnos nuevos con cobro mensual habilitado. Está marcada inicialmente y permite elegir un único mes/año (inicialmente el actual de Argentina). Al desmarcarla se guarda solo alumno y configuración. Editar nunca crea cuotas.

SQL pendiente de revisión
------------------------

Revisar `database/006-alta-primera-cuota.sql` antes de instalarla manualmente en Supabase. Requiere 001..005 ya revisadas e instaladas; no ejecutar 005 automáticamente como parte de esta etapa. No se ha ejecutado ninguna migración remota.

La nueva RPC `crear_alumno_con_primera_cuota` llama al guardado existente y agrega una cuota en una sola transacción. Usa `SECURITY INVOKER`, autorización administrativa, `auth.uid()`, RLS existente y `search_path` vacío. Solo concede EXECUTE a authenticated; no agrega permisos sobre tablas ni cambia políticas. El importe y día se leen de la configuración guardada, no de un payload financiero independiente. Un error de cuota revierte también el alumno y su configuración. Se reutiliza el concepto mensual y su restricción UNIQUE.

Los reintentos conservan el ID del alta. Si el primer intento se confirmó pero se perdió la respuesta, repetirlo falla por ID duplicado sin modificar datos; revisar el listado y las cuotas antes de reintentar. No se fusionan personas por nombre/email: no son identificadores únicos del esquema actual.

Sin la RPC instalada, intentar el alta con primera cuota devuelve un error y no realiza altas separadas como alternativa. Las altas sin primera cuota y las ediciones mantienen la RPC anterior. Instalar SQL revisado antes de habilitar esta versión para uso habitual.

Cómo verificar
--------------

1. Ejecutar `npm test -- --watch=false` y `npm run build -- --configuration production`.
2. Ejecutar `node scripts/probar-006-postgres.mjs`: PostgreSQL embebido local, sin red ni Supabase. Requiere el PGlite local usado por las pruebas de 005, en `tmp/aislamiento-tools`.
3. Tras revisar e instalar 006 en un entorno de pruebas, abrir Alumnos → Agregar alumno. Probar sin cobro mensual, con cobro mensual y primera cuota desmarcada, y con primera cuota marcada.
4. Comprobar nombre, importe y período en Cuotas y cobros. Elegir el período del alta si difiere del filtro actual. No debe haber pagos ni cuotas de meses no seleccionados; un vencimiento anterior a hoy aparecerá como Vencida.
5. Probar febrero (28/29), abril (30) y diciembre (31) con día 31. Editar importe/configuración y comprobar que la cuota anterior no cambie. Registrar un cobro sigue siendo una acción independiente.
6. En un celular o emulación, verificar el selector mes/año, checkbox, errores y botón Guardar sin desbordamiento. Esta revisión visual manual no se sustituye por las pruebas de componentes.

No incluye Cron, cambios de pagos, reglas financieras nuevas ni ejecución de SQL remoto.
