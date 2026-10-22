# Cuentas y pagos

El módulo usa cuotas y pagos separados, relacionados con los IDs de los alumnos existentes.
No genera cuotas mensuales automáticamente ni procesa cobros electrónicos.

## Probar localmente

```bash
npm start
```

Abrir `http://localhost:4200/#/cuentas`.

1. Crear una **Nueva cuota**: elegir un alumno, concepto, período, importe y vencimiento.
2. Crear una cuota de $50.000 y registrar un pago de $30.000. El saldo debe ser $20.000.
3. Registrar los $20.000 restantes: la cuota debe quedar **Pagada**.
4. Abrir **Detalle** para consultar el historial, editar un pago y confirmar el cambio.
5. Eliminar un pago desde el historial y confirmar: el saldo aumenta y los ingresos disminuyen.
6. Probar importes negativos, cero, más de dos decimales o pagos mayores al saldo: no se guardan.
7. Editar la cuota: no permite reducir su importe por debajo del total ya abonado.
8. Crear otra cuota con mismo alumno, concepto y período: debe rechazar el duplicado.
9. Las cuotas con saldo y vencimiento anterior a hoy muestran **Vencida**, incluyendo la indicación de pagos parciales cuando corresponde. Las que vencen hoy aún no están vencidas.
10. Una cuota solo puede eliminarse si no tiene pagos, siempre con confirmación en **Detalle**.
11. Recargar y verificar que los datos se conservan. Consultar el dashboard y la ficha del alumno.
12. Probar a 390 px: filtros y formularios en una columna, diálogos con scroll y tabla con desplazamiento horizontal.

Los filtros del listado se combinan: búsqueda por alumno, período, estado y modalidad.
La ficha del alumno muestra todas sus cuotas, el saldo pendiente y acceso al historial.
La próxima cuota muestra el vencimiento pendiente más antiguo, incluyendo deudas vencidas.
Si todas están pagadas indica **Sin cuotas pendientes**; si nunca tuvo cuotas, **Sin cuotas**.

## Datos e indicadores

- `core/cuentas.ts`: modelos, fechas civiles locales y utilidades monetarias.
- `CuentasService`: operaciones y validaciones; Signals para saldos e indicadores.
- `CuentasRepository`: lectura y escritura de un documento versionado en `rochy.cuentas.v1`.
- Las dos colecciones se guardan juntas para evitar escrituras parciales entre cuotas y pagos.
- Los importes se calculan en centavos para evitar saldos residuales de punto flotante.
- Los estados no se persisten: se derivan de los pagos y vencimientos.
- Las relaciones se validan al leer y guardar. Los datos corruptos no se reemplazan por ejemplos.
- La clave de alumnos `rochy.alumnos.v1` no se reinicializa ni se modifica desde cuentas.
- Si no existe almacenamiento de cuentas, se inicia vacío. No se crean cuotas ni pagos al abrir la aplicación.
- Un listado guardado vacío se respeta y no vuelve a llenarse.
- Ingresos del mes: suma de pagos cuya fecha pertenece al mes local actual.
- Cuotas pendientes: todas las cuotas con saldo positivo, incluidas parciales y vencidas.
- Próximos vencimientos: cuotas con saldo que vencen entre hoy y los siguientes siete días, inclusive.
- Cobros a seguir: primeras cuatro cuotas pendientes ordenadas por vencimiento.
- El día local se actualiza cada 30 segundos para recalcular estados al cambiar de fecha.

## Verificación automatizada

```bash
npm test -- --watch=false
npm run build -- --configuration production --base-href /rochi.entrena/
```

Los tests cubren cuotas, pagos completos y parciales, ediciones y bajas, precisión monetaria,
fechas, duplicados, relaciones, persistencia, indicadores y errores de almacenamiento.
Los componentes no acceden directamente a localStorage; el repositorio concentra esa dependencia
para permitir su sustitución al incorporar una API REST.

## Configuración y generación mensual

En **Agregar alumno** o **Editar alumno**, usar la sección **Configuración de cobro**.
La casilla **Habilitar cuota mensual** comienza desmarcada. Al marcarla se muestran los campos
obligatorios de importe mensual en ARS (positivo, hasta dos decimales) y día de vencimiento (entero de 1 a 31).
Al desmarcarla se ocultan; una configuración previa conserva sus valores y queda deshabilitada.
La ficha individual muestra el estado de la configuración, importe y vencimiento cuando está habilitada.
Los alumnos anteriores siguen sin configuración hasta que Rochy la guarde; no se migran ni reinicializan datos.
La configuración es un objeto opcional tipado en el alumno y no modifica cuotas ni pagos existentes.

En Cuentas y pagos, usar **Generar cuotas del mes**, elegir mes y año y actualizar la vista previa.
Se detallan los importes propios de cada alumno y los vencimientos, junto con todos los omitidos y sus motivos.
Solo **Confirmar generación** guarda el lote, en una única escritura del repositorio de cuentas.
El servicio vuelve a comprobar la vista previa; si cambiaron alumnos, configuración o cuotas, exige actualizarla.
El concepto es **Cuota de entrenamiento** y la clave de duplicado es alumno, concepto normalizado y período.
Los días inexistentes se ajustan al último día del mes, incluyendo febrero bisiesto.

Las pruebas incluyen varios alumnos, falta de configuración, bajas, deshabilitación, duplicados manuales
y masivos, meses de distinta duración, precios nuevos, historial y pagos intactos, recarga y fallas de almacenamiento.

### Recorrido de prueba

1. Agregar un alumno sin marcar la casilla: debe guardarse sin pedir importe ni vencimiento.
2. Agregar otro con cuota mensual habilitada, importe y día 31. Probar antes campos vacíos, cero y día 32: no deben guardarse.
3. Editar el primero y habilitar su cuota con otro importe. Consultar ambos en la ficha individual.
4. Generar una vista previa de febrero de 2027, febrero de 2028, abril y enero: el día 31 debe ajustarse a 28, 29, 30 y 31 respectivamente.
5. Cancelar una vista previa: no debe crear cuotas. Confirmar otra y repetir el mismo mes: no debe duplicarlas.
6. Poner un alumno en pausa o inactivo: la vista previa debe indicar que se omite.
7. Cambiar el importe desde Editar alumno y generar otro mes: el importe anterior y sus pagos deben mantenerse intactos.
8. Recargar: verificar alumnos, configuración, cuotas y pagos. Probar también un alumno anterior sin configuración y la creación manual de cuotas.
