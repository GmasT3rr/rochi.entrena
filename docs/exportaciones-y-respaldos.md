# Exportaciones y copias de seguridad

En **Configuración** están las descargas independientes de alumnos, cuotas y pagos y el respaldo completo JSON.

## CSV para Excel

Los CSV usan UTF-8 con BOM, separador punto y coma, filas CRLF, fechas `dd/MM/aaaa`, períodos `MM/aaaa`
y montos numéricos con coma decimal y encabezados en ARS. Cada celda se entrecomilla y las comillas internas
se duplican; los saltos de línea del texto se conservan dentro de la celda.
Los textos que podrían ejecutarse como fórmulas reciben un apóstrofo inicial (incluye teléfonos con `+`).
Esta protección solo afecta al CSV: los valores originales permanecen en la aplicación y en el JSON.
Cuotas y pagos incluyen identificadores, nombres resueltos desde alumnos y las referencias correspondientes.

Para comprobar en Excel de Argentina: abrir los tres CSV y verificar acentos, columnas separadas, fechas,
montos con centavos y observaciones con punto y coma, comillas y saltos de línea. Si Excel tiene otra
configuración regional, importar desde **Datos → Desde texto/CSV**, seleccionar UTF-8 y punto y coma.

## Respaldo y restauración

El JSON contiene únicamente `formato: "rochy"`, `version: 1`, `generadoEn` (UTC ISO), `alumnos`, `cuotas` y `pagos`.
La configuración mensual opcional y la próxima cuota registrada se conservan dentro de cada alumno.
No se exportan otras claves del navegador ni estados calculados del dashboard.

1. Crear una copia de seguridad y conservar el archivo descargado.
2. Seleccionar el JSON en **Restaurar copia de seguridad**. Todavía no se modifican datos.
3. Verificar cantidades y fecha de generación. Se rechazan JSON inválidos, versiones incompatibles,
   campos ajenos, campos obligatorios faltantes, fechas/importes inválidos, IDs duplicados, referencias
   inexistentes, cuotas duplicadas y pagos que exceden una cuota.
4. Usar **Descargar copia de los datos actuales** antes de reemplazarlos si se desea conservarlos.
5. Marcar la confirmación explícita y pulsar **Confirmar restauración**. Cancelar no cambia los datos.
6. Comprobar alumnos, configuraciones, cuotas, pagos e indicadores del dashboard. Recargar y repetir la comprobación.

La restauración reemplaza el conjunto completo, sin mezclar registros. Una sola escritura atómica de
localStorage persiste el conjunto en `rochy.datos.v1`; solo después se actualizan los Signals existentes.
Si la escritura falla (por ejemplo, falta de espacio), se conserva el conjunto anterior y los Signals no cambian.
Los repositorios existentes leen y escriben este documento desde la primera restauración exitosa.
Antes de eso se siguen utilizando las claves anteriores `rochy.alumnos.v1` y `rochy.cuentas.v1` sin migración.
Estas claves anteriores no se borran, pero dejan de ser la fuente activa después de restaurar.
Un respaldo vacío permanece vacío y no vuelve a cargarse con datos de demostración.

## Verificación automatizada

```sh
npm test -- --watch=false
npm run build -- --configuration production
```

Las pruebas verifican BOM y formato CSV, escape y protección de fórmulas, respaldo sin pérdida de valores,
restauración completa, confirmación y cancelación, validación, fallas de escritura antes y después de una
restauración previa, persistencia, continuidad de los ABM existentes y actualización de indicadores.
La apertura visual en Excel requiere una comprobación manual en esa aplicación.
