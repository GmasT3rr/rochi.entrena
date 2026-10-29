# Perfil de entrenamiento del alumno

## Instalación manual

Revisar y ejecutar **manualmente como postgres** `docs/database/014-perfiles-entrenamiento.sql`, una sola vez. Se inspeccionó el esquema versionado del repositorio; no se consultó ni modificó el esquema del proyecto remoto. La migración necesita `alumnos` con aislamiento 005 y las funciones revisadas de auditoría, propietario inmutable y actualización. Debe revisarse cualquier personalización instalada antes de aplicarla.

La migración crea `public.perfiles_entrenamiento`, una fila como máximo por propietario/alumno. Incluye UUID propio, FK compuesta hacia `alumnos(propietario_id,id)`, UNIQUE por propietario/alumno, restricciones de captura, timestamps y políticas permisiva/restrictiva que exigen administrador activo y `auth.uid()`. No concede acceso a anónimos ni DELETE a usuarios del frontend. No modifica columnas de alumnos, tablas financieras, RPC financieras, autenticación, Storage o documentos.

Los triggers reutilizan `impedir_cambio_propietario`, `marcar_actualizacion` y la auditoría 005. Se agrega un trigger específico que impide trasladar un perfil a otro alumno: el trigger de actualización existente solo conoce la identidad por `id` para tablas distintas de configuración mensual. La auditoría registra snapshots del perfil, actor y propietario con el aislamiento histórico existente.

## Campos

Todos los campos del cuestionario son **NULL por defecto** y admiten NULL. No se copian datos ficticios, valores de ejemplo, mínimos de controles ni datos extraídos de documentos.

| Grupo | Campos |
| --- | --- |
| Datos físicos | Edad declarada al completar la ficha, altura en cm, peso declarado en kg, ciudad |
| Experiencia y actividad | Tiempo entrenando (una sola pregunta), realiza cardio (sí/no/NULL), tipo de cardio, sesiones por semana y duración aproximada por sesión en minutos |
| Hábitos | Agua diaria en litros, alimentación (Baja/Regular/Buena/Muy buena), actividad laboral, horas de sueño, estrés percibido (Bajo/Medio/Alto) |
| Organización | Días y horarios disponibles para entrenar |
| Objetivos | Objetivos personales y compromiso de asistencia (sí/no/NULL) |

La edad declarada se identifica como dato del momento de completar la ficha: no se calcula a partir del calendario ni se incrementa automáticamente. `creado_en` y `actualizado_en` son fechas técnicas de registro, no se presentan como una fecha de evaluación declarada por el alumno.

Límites de captura, iguales en el cliente y SQL: edad entera 0–130; altura 1–300 cm; peso 0,01–1000 kg; sesiones de cardio enteras 0–100 por semana; duración entera 1–1440 minutos; agua 0–30 litros; sueño 0–24 horas. Magnitudes decimales admiten hasta dos decimales. Son controles de formato y rango de captura, **no objetivos, recomendaciones ni umbrales clínicos**. Ciudad admite 150 caracteres; tiempo entrenando y tipo de cardio 300; trabajo 500; disponibilidad 1500; objetivos 3000. La migración rechaza claves desconocidas, tipos incorrectos y snapshots incompletos de guardado.

No se agregaron campos de diagnósticos, patologías, medicación, anticonceptivos, cirugías, partos, análisis clínicos o período menstrual. No hay extracción de Word, diagnóstico, asesoramiento clínico, fotografías o videos de evaluación en este módulo.

## Uso y errores parciales

Entrenamiento muestra primero una consulta agrupada con los campos informados. Los valores 0 y No se muestran como respuestas reales; los NULL se omiten. Si no hay fila o todos sus campos están vacíos, muestra “Perfil de entrenamiento pendiente de completar”. La edición usa un diálogo con cinco secciones desplegables. Todos sus controles y validaciones se comparten con el alta mediante `PerfilCampos`.

La carga inicial usa LoadingLayout y MinimumLoading. Refrescar conserva el contenido durante la solicitud; si falla, se muestra error y se bloquea la edición. Una lectura fallida o una respuesta incompleta nunca inicializa un formulario vacío para guardarlo sobre datos existentes. Cambiar de alumno o sesión invalida respuestas tardías. El repositorio comprueba alumno y propietario en las respuestas, además del RLS efectivo en servidor.

`guardar_perfil_entrenamiento` recibe el snapshot completo y la versión leída (`actualizado_en`). Bloquea la fila del alumno para serializar creaciones del perfil, verifica dueño/administrador y luego aplica comparación de versión. Si existe un perfil distinto y no se dispone de su versión vigente, rechaza el reemplazo. Si el snapshot coincide exactamente con el guardado, devuelve ese perfil sin otra escritura: permite reintentar una respuesta perdida sin duplicar filas ni auditoría. Los cambios intencionales de un valor a vacío envían NULL; no se confunden con lecturas fallidas.

En Agregar alumno, Perfil de entrenamiento (opcional) comienza contraído. Un perfil sin datos no crea una fila y no impide el alta mínima. Si se completa, primero se valida y crea al alumno por el servicio existente y luego se guarda su perfil. Perfil y documentos informan resultados independientes: un fallo del perfil no cancela documentos confirmados y un fallo de documentos no vuelve a guardar un perfil confirmado. Reintentar pendientes nunca repite la creación del alumno ni crea nuevamente su primera cuota. Finalizar conserva al alumno y permite completar lo que falta desde la ficha. Si se recarga antes de confirmar los complementos, los datos aún no persistidos deben volver a ingresarse desde el alumno ya creado.

La protección de cambios pendientes también cubre los campos del perfil. Un error de guardado conserva los valores editados. Un conflicto de versión pide cerrar y actualizar la consulta antes de editar otra vez.

## Minimización, autorización y conservación

Registrar solo información necesaria para el seguimiento de entrenamiento, facilitada por el alumno con la autorización correspondiente. La interfaz lo recuerda; **no registra ni demuestra por sí misma un consentimiento**. El procedimiento de consentimiento debe gestionarse por la organización y no se sustituye con una casilla inventada o una fecha automática. No completar textos libres con historia médica ni extraerla de los documentos adjuntos.

Los documentos originales permanecen privados y separados, con sus políticas de ETAPA 2. El perfil no los sustituye ni los elimina. No se agregan datos de perfil a exportaciones financieras, consola o almacenamiento local del navegador.

Antes del uso real, la administración debe definir el plazo y propósito de conservación, revisar la necesidad de los campos y tramitar correcciones/supresiones conforme a su procedimiento. La aplicación no inventa un plazo ni realiza purgas automáticas. La auditoría mantiene versiones anteriores: poner un campo en NULL no elimina copias históricas. Una supresión autorizada debe considerar perfil, auditoría, documentos y respaldos, sin aplicar borrados masivos ni cambiar políticas financieras. No se implementó eliminación automática ni un sistema nuevo de gestión de consentimientos.

## Archivos principales

- `src/app/core/perfil-entrenamiento.ts`: modelo, campos, opciones, normalización y validaciones compartidas.
- `src/app/core/services/perfiles-entrenamiento-repository.ts`: autorización existente, lectura por alumno, guardado por RPC y control de sesión/versiones.
- `src/app/features/alumnos/perfil-campos.ts`: controles comunes para alta y edición.
- `src/app/features/alumnos/perfil-editor.ts`: edición protegida y manejo de conflictos.
- `src/app/features/alumnos/alumno-entrenamiento.ts` y `.scss`: consulta, loading/error/empty y apertura del editor.
- `src/app/features/alumnos/alumno-form.ts` y `.html`: sección opcional y reintento independiente de complementos.
- `src/app/features/alumnos/alumno-ficha.ts`: integra únicamente Entrenamiento; mantiene las otras pestañas.
- `src/app/features/guia/guia-contenido.ts`: guía de uso actualizada.
- Pruebas del modelo, repositorio, editor, consulta, alta e integración de ficha.

## Verificación local realizada

Suite con SDK simulado para consultas/guardados, errores de red/permisos, validación de snapshots y cambios de sesión. Se probaron alta sin perfil, perfil parcial/completo, documentos junto al perfil, fallos parciales sin repetir el alta, edición y NULL/No/cero. Regresión de edición de alumnos, finanzas, documentos y navegación existente. La lectura repetida desde el SDK simulado no equivale a demostrar persistencia real en Supabase.

Comando: `npm test -- --watch=false --runner-config=tmp/vitest-documentos.config.mjs`. Configuración local de concurrencia: `export default { test: { maxWorkers: 2, fileParallelism: false } };`, sin aumentar timeouts.

Resultado final: **400 tests aprobados en 47 archivos**. Build de producción correcto, con advertencia de paquete inicial de 912,59 kB frente al presupuesto de aviso de 500 kB.

Se compiló producción. Edge headless con repositorios ficticios verificó consulta, edición, actualización de la consulta tras guardar, alta opcional contraída y campos iniciales vacíos a 320, 375, 768 y 1440 px; no hubo desbordamiento horizontal ni excepciones. Evidencia local ignorada por Git: `tmp/entrenamiento-*.png` y `tmp/entrenamiento-browser-results.json`.

**No se ejecutó la migración ni se probaron RLS o persistencia reales.** No hubo cambios en datos reales, commit, push ni deploy.

## Pruebas manuales pendientes de Supabase

Usar exclusivamente un entorno de pruebas, cuentas y alumnos desechables, sin información sensible. Instalar 014 después de revisar las funciones instaladas. Preparar administradores activos A y B, alumnos A1/A2 de A y B1 de B, además de una cuenta no administradora.

1. Como A, crear alumno sin abrir el perfil y comprobar que no se crea fila. Repetir con el panel abierto pero vacío; debe funcionar igual.
2. Crear con perfil parcial y completo. Comprobar los NULL de lo no informado, respuestas No y valores 0. Recargar la página o cerrar sesión/volver a ingresar; consultar los mismos valores en A1. Abrir A2: no debe mostrar datos de A1.
3. Editar, guardar, recargar y limpiar intencionalmente un opcional. Debe guardarse NULL; los demás campos deben conservarse. La edad no debe cambiar por la fecha del sistema.
4. Fuera de Angular, intentar INSERT/UPDATE/RPC con edad fraccionaria, números fuera de rango, selectores no permitidos, valores de tipo incorrecto y metadatos/campos desconocidos en `p_datos`. La base debe rechazarlo. La tabla no debe aceptar propietario A con alumno B1 ni propietario B con alumno A1.
5. Con el JWT de B, intentar SELECT/INSERT/UPDATE sobre el perfil de A1 y llamar la RPC para A1. No debe leer ni modificar datos de A. SELECT/UPDATE pueden devolver cero filas: comprobar también el estado posterior como A. Repetir sin JWT y con la cuenta no administradora. No usar service_role para validar RLS.
6. En dos sesiones de A, leer la misma versión, guardar datos distintos en una y tratar de guardar la otra: debe aparecer conflicto sin reemplazar el primer cambio. Simular lectura fallida y verificar que no se habilita un editor vacío. Simular respuesta perdida de creación/guardado y repetir el mismo snapshot: debe conservar una sola fila.
7. Cortar la red después del alta pero antes del perfil: conservar alumno/primera cuota y reintentar solo el perfil. Probar también perfil fallido con documentos guardados y perfil guardado con documento fallido. No debe duplicar alumno, cuotas, perfil o archivos confirmados.
8. Verificar filas de auditoría con `tabla='perfiles_entrenamiento'`, actor y propietario correctos. B no debe ver la historia de A. No debe haber contenido de documentos ni URLs temporales en esos registros.
9. Confirmar que Documento/Finanzas/Resumen conservan sus funciones y que los archivos originales permanecen disponibles. Probar teclado y tamaños mobile/desktop, navegación entre alumnos y cambio de sesión con una consulta pendiente.

Inspección de solo lectura como postgres tras instalar:

```sql
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='perfiles_entrenamiento'
order by ordinal_position;
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename='perfiles_entrenamiento';
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.perfiles_entrenamiento'::regclass;
```
