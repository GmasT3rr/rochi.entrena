# Dashboard: gráficos y métricas

Los datos provienen del snapshot ya cargado por CuentasService mediante Supabase. No se agregaron consultas, tablas, RPC ni librerías. Los filtros son Signals calculados; los cambios de período no generan solicitudes ni resultados fuera de orden. Carga, error y sesión no disponible ocultan métricas y gráficos; una consulta fallida nunca se presenta como cero.

## Gráficos

- **Evolución de ingresos:** 3, 6, 12 o 24 meses (12 por defecto) terminando en el período elegido, agrupando pagos por su fecha efectiva de cobro. Incluye pagos parciales y pagos de cuotas de otros meses. Los meses sin pagos confirmados tienen cero. Al límite inferior del rango admitido (enero de 1900) se muestran solo meses válidos.
- **Estados de cuotas:** número de cuotas del período en cada estado calculado por el servicio existente: Pagada, Parcial, Pendiente, Vencida. Son grupos excluyentes; una vencida con abonos permanece en Vencida, sin contarse dos veces.
- **Modalidad:** alumnos activos actuales, Presencial/Online, sin depender del período financiero.

GraficoDashboard es un componente SVG reutilizable de l?nea y donas: muestra valores y etiquetas, usa botones accesibles con tooltips Material al pasar el mouse, enfocar o tocar, y conserva texto accesible. No depende únicamente del color. Los colores usan las variables del tema; las transiciones respetan prefers-reduced-motion. La evolución admite desplazamiento horizontal en móvil para mantener legibles los 12 meses.

## Fórmulas

- **Cobrado en el mes:** suma de pagos cuya fecha pertenece al mes seleccionado.
- **Cobranza del período:** suma de `abonado` de las cuotas del período / suma de `importe` de esas cuotas × 100. Incluye abonos recibidos en cualquier mes. Sin cuotas emitidas: «No aplica». Refleja la situación actual de esas cuotas, no una reconstrucción del saldo al cierre histórico del mes.
- **Deuda vencida del período:** suma del saldo actual de cuotas de ese período cuyo estado existente es Vencida, calculado con el día argentino del servicio.
- **Alumnos con deuda:** cantidad de IDs distintos de alumnos con saldo positivo en cuotas del período.
- **Comparación de ingresos:** cobros del mes seleccionado menos cobros del mes anterior. Variación porcentual = diferencia / cobros anteriores × 100; sin cobros anteriores no se calcula porcentaje. No compara cuotas emitidas con ingresos.

Las agregaciones monetarias usan centavos enteros. No se cambia el cálculo de saldos ni la clasificación financiera del servicio. Los conteos que antes ocupaban tarjetas de estados se presentan en el gráfico para evitar repetirlos.

## Verificación

174 tests aprobados en 17 archivos y build de producción correcto con el base href existente. Se prueban pagos parciales, diferencias entre fecha del pago y período de cuota, agrupación mensual, meses vacíos, cruce de años, límites, porcentajes sin denominador, exclusión de gráficos ante errores, etiquetas accesibles y enlace del tooltip a la interacción.

Bundle inicial: 792,02 kB frente a 787,90 kB anteriores (+4,12 kB); continúa la advertencia orientativa de 500 kB. La actualizaci?n de l?nea/donas conserva el mismo bundle inicial de 792,02 kB; el chunk diferido del Dashboard mide 42,31 kB (11,46 kB estimados transferidos). El Dashboard mantiene su carga diferida. No cambian package.json ni package-lock.json.

Pendiente aceptación visual en navegador/celular: probar 3/6/12/24 meses, scroll del gráfico, tooltips con mouse/teclado/toque, ambos temas, movimiento reducido y contraste. Las pruebas automáticas de DOM y la compilación de estilos no sustituyen esa revisión visual. No se ejecutaron consultas nuevas contra Supabase, ni commit, push o deploy.

## Reorganización visual del Dashboard

Se compactó el encabezado junto al selector existente. Los cuatro indicadores principales ocupan una fila en escritorio y dos columnas en tablet/celular; el modo compacto de StatCard es opcional y se activa únicamente en Dashboard. Los alumnos se resumen en la tarjeta de modalidad, y el contador de alumnos con deuda pasó al encabezado de vencimientos.

El gráfico de ingresos redujo su altura de 280 a 200 px (180 px en móvil), incorpora un sombreado suave y conserva puntos/tooltips para todos los meses. Se eliminaron los anchos mínimos de 500/840 px que provocaban scroll horizontal: ahora se adapta al contenedor y reduce etiquetas en pantallas pequeñas. Se conservan las opciones 3/6/12/24 meses; se detectó y repuso la opción de 3 meses que faltaba en el menú anterior.

Las donas crecen a 200 px en escritorio, con leyendas compactas y dos tarjetas en paralelo; en móvil pasan a una columna. Las deudas usan filas compactas con alumno/concepto, vencimiento, saldo y estado. En móvil se distribuyen en dos líneas por cuota. Se conserva el orden por vencimiento y el límite de 8 filas del servicio existente; las vencidas se distinguen por fondo, borde y fecha, además del estado textual.

Validación de esta reorganización: 174 tests aprobados y build correcto. Se inspeccionaron plantillas y estilos responsive; no se realizó inspección visual autenticada en navegador ni se verificaron píxeles/overflow en dispositivos reales. Sigue pendiente comprobar escritorio, tablet y celular con ambos temas y datos reales. Los servicios y fórmulas no se modificaron en este rework. No hubo commit, push ni deploy.
