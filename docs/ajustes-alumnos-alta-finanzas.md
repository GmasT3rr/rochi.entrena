# Alta y Finanzas de alumnos

## Alta rápida

Se reutiliza `AlumnoForm` para alta y edición, con el mismo modelo y los mismos validadores. Datos básicos muestra nombre, apellido, modalidad, estado y fecha de ingreso. Activo y la fecha argentina actual siguen siendo los valores iniciales.

Teléfono, email y observaciones quedan en Información adicional (opcional), cerrada inicialmente en un alta. Si se intenta guardar con un dato adicional inválido, se abre esa sección para mostrar el error. En edición comienza abierta.

Configuración mensual conserva sus reglas, checkbox, período y primera cuota. Los campos se muestran solo al habilitarla. No se modificaron cuotas, reglas de generación, autenticación ni RLS.

Documentos (opcional) permite seleccionar varios archivos antes de guardar. Reutiliza los tipos, validaciones, configuración y repositorio de ETAPA 2. Primero se confirma el alta por el servicio existente, con su ID estable; luego se suben los archivos. No se sube nada si falla la creación del alumno.

Cada archivo mantiene un UUID y un resultado independiente. Si hay errores, el alumno ya creado se conserva y sus campos quedan bloqueados para evitar que un reintento parezca guardar nuevos cambios. Reintentar documentos procesa únicamente los no confirmados y mantiene los identificadores. Si se perdió una respuesta, el repositorio reconoce un documento ya confirmado o completa metadatos del objeto previo sin sobrescribirlo. Finalizar permite conservar el alumno y gestionar los documentos después desde su ficha.

Si se cierra o recarga el navegador, los archivos que aún no se subieron deben seleccionarse otra vez desde la ficha del alumno ya creado; el navegador no persiste archivos locales. Los objetos que llegaron a Storage siguen teniendo la recuperación de ETAPA 2.

## Configuración antes de crear al alumno

La RPC existente `listar_documentos_alumno` exige que el alumno exista. Para seleccionar y validar archivos antes del alta sin duplicar los límites del servidor, se agregó **013-configuracion-documentos-alta.sql**: una RPC administrativa de solo lectura que devuelve la configuración de 012. No crea tablas, columnas o políticas y no altera las funciones existentes.

Revisar y ejecutar **manualmente** `docs/database/013-configuracion-documentos-alta.sql` como postgres, después de 012. No se ejecutó desde el agente. Hasta instalarla, la selección de archivos en el alta informa que no está disponible; el alta sin documentos y la pestaña Documentos de ETAPA 2 siguen disponibles según su instalación previa.

## Finanzas compactas

Solo se reemplazó el contenido de Finanzas dentro de la ficha. Resumen, Documentos y Entrenamiento mantienen su contenido. `AlumnoFinanzas` muestra saldo pendiente y cantidad de cuotas con saldo, usando los valores ya calculados por `CuentasService`.

Nuevo movimiento abre Crear cuota o Registrar cobro directo con el alumno preseleccionado. Ambos reutilizan los formularios actuales. Registrar pago aparece sobre cada cuota con saldo y reutiliza `CuentaForm` con la cuota correspondiente. Ver detalle abre `CuotaDetalle` o el detalle de cobro directo existente. Ver todas las cuentas conserva la ruta actual con el filtro del alumno.

El historial reutiliza `movimientosVista`, el mismo adaptador del listado global. Orden descendente por vencimiento de cuota o fecha del cobro, con desempate por clave. Cada cuota muestra concepto, período, vencimiento, estado, importe y saldo. Cada cobro directo muestra concepto, fecha e importe recibido; no se presenta como deuda. Los pagos permanecen en el detalle de cuota, no se agregan como filas de ingresos duplicadas. No se recalculan saldos ni se suman importes de cuotas como ingresos.

Se quitaron de la ficha los filtros y exportaciones duplicados, el bloque completo de cobros y los múltiples botones de actualización. Las herramientas globales de Cuotas y cobros no se eliminaron. No se agregan consultas al abrir la pestaña: consume las señales financieras existentes y conserva su contenido durante actualizaciones.

## Verificación

- Suite completa con concurrencia limitada, sin ampliar timeouts: `npm test -- --watch=false --runner-config=tmp/vitest-documentos.config.mjs`. Configuración local: `export default { test: { maxWorkers: 2, fileParallelism: false } };`.
- Pruebas de alta mínima, información adicional, configuración mensual/primera cuota, selección de documentos, error parcial, reintento con IDs estables y cierre conservando al alumno. Se comprueba que los reintentos no repiten la creación ni suben documentos confirmados.
- Pruebas de historial unificado, cuotas parciales, saldo, cobros directos sin vencimiento/deuda, alumno preseleccionado y acciones contextuales. Regresión de edición, documentos ETAPA 2, servicios financieros y navegación existente.
- Edge headless a 320, 375, 768 y 1440 px con los componentes reales, estilos globales y servicios ficticios: apertura de Finanzas, menú de movimientos, alta con información adicional cerrada y reintento de un archivo fallido. Una sola alta y llamadas de subida `a.pdf, b.pdf, b.pdf`. Sin desbordamiento horizontal ni excepciones del navegador. Evidencia local en `tmp/alumnos-*.png` y `tmp/alumnos-browser-results.json`, ignorada por Git.
- Build de producción. La advertencia existente de tamaño inicial se mantiene.

No se ejecutaron migraciones, llamadas reales de subida/descarga ni pruebas reales de RLS. Para validar persistencia, instalar manualmente 012/013 en un entorno de pruebas y seguir `docs/documentos-alumnos.md`. No se modificaron datos reales, no se implementó ETAPA 3 y no se hicieron commit ni push.
