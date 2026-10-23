# Skeleton loading

`shared/skeleton/Skeleton` permite configurar ancho, alto y forma (rectángulo, línea, círculo o tarjeta). Usa únicamente CSS: brillo hacia la derecha, paleta gris por tema y animación desactivada con prefers-reduced-motion. No contiene datos ni elementos interactivos.

`LoadingLayout` compone esos bloques para Dashboard, listados y detalle de pagos. Tiene aria-busy y un estado textual accesible; la representación visual es decorativa y queda oculta a lectores de pantalla.

- Dashboard: usa las condiciones de carga/guardado y disponibilidad existentes. Reproduce cuatro indicadores, gráfico de ingresos, dos tarjetas con donas (incluido el resumen de alumnos) y deudas. Los errores mantienen su rama propia y ocultan el skeleton.
- Alumnos: el listado se sustituye mientras `service.cargando()` es verdadero; filtros y acciones superiores conservan su ubicación. Al finalizar se recuperan el resultado, el estado vacío o el error existente.
- Cuentas: sustituye la tabla durante `service.cargando()`, manteniendo los filtros. En el detalle de cuota, la misma señal muestra placeholders del resumen financiero y de las filas del historial de pagos.

No se agregaron consultas, datos de ejemplo, retrasos, temporizadores de carga ni cambios de negocio. Los placeholders no prometen un número de registros: representan espacio mientras se espera la respuesta real. No se modifica la distribución de las vistas una vez cargadas.

Validación: 178 tests en 18 archivos, 6 pruebas del tema y build de producción correctos. Las pruebas comprueban formas/dimensiones, accesibilidad, permanencia durante la espera y retirada al finalizar con error o resultado vacío. Bundle inicial sin incremento (792,02 kB, con la advertencia de presupuesto ya existente).

Pendiente comprobación visual autenticada en navegador: activar red lenta, probar recarga y finalización de cada consulta, ambos temas y viewport móvil/escritorio. No se midió CLS ni se simuló red real contra Supabase en esta sesión; las pruebas de espera usan señales controladas. No hubo commit, push ni deploy.
