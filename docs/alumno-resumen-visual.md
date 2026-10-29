# Presentación de Resumen del alumno

Cambio limitado a `alumno-ficha.ts`, su plantilla `alumno-ficha.html`, estilos `alumno-ficha.scss` y pruebas. No se modificaron formularios, servicios, cálculos, SQL, autenticación, RLS ni el contenido de Finanzas, Documentos o Entrenamiento.

El encabezado identifica al alumno con nombre destacado, iniciales decorativas, modalidad y badge de estado reutilizado del sistema visual. No se incorporan fotografías ni datos nuevos.

Se reutiliza `StatCard` en su variante compacta para cuota configurada y saldo pendiente. La cuota se distingue del dinero cobrado; una configuración deshabilitada conserva el importe con su estado, y la ausencia de configuración muestra No configurada. El saldo proviene exclusivamente de `CuentasService.saldoAlumno`, incluido cero. Los errores o la carga del saldo nunca se reemplazan por un cero ficticio.

Datos personales, Información adicional y Configuración mensual usan tarjetas Material outlined sin sombras, con padding y colores existentes. Sus botones Editar/Configurar están en el encabezado, con nombres accesibles completos y los mismos formularios contextuales. El estado local de edición es reactivo para volver a habilitar los botones al cerrar un editor. No se cambió el guardado.

Los pares etiqueta/valor se agrupan en grillas de dos columnas y pasan a una en mobile. Observaciones ocupa todo el ancho, conserva sus saltos de línea y se muestra completa. Los valores vacíos se indican como Sin completar. La tarjeta mensual mantiene importe, día de vencimiento y período cuando existe; no contiene deuda histórica. Se conserva Ver en Cuentas y Volver al listado.

La ficha usa un único scroll vertical del contenido y conserva el footer de regreso accesible. Las pestañas mantienen `preserveContent` y no se agregan consultas ni navegación nueva.

## Verificación

- Suite completa mediante `npm test -- --watch=false --runner-config=tmp/vitest-documentos.config.mjs`, con concurrencia limitada y sin aumentar timeouts. Nuevas pruebas de estado inactivo, datos incompletos, deuda cero, mensual deshabilitada, observaciones extensas, acciones de las tres tarjetas, actualización desde señales del servicio y reactivación tras cerrar un editor.
- Regresión de estados loading/error/empty, edición, alta y navegación entre pestañas mediante los tests existentes.
- Edge headless a 320×640, 375×812, 768×1024 y 1440×900 con los componentes reales y servicios ficticios: activo/habilitada/con deuda, deshabilitada con 2394 caracteres de observaciones e inactivo/sin configuración/saldo cero. Sin desbordamiento horizontal, acciones dentro de las tarjetas y footer dentro de la pantalla. Apertura/cancelación consecutiva de los tres editores y navegación Finanzas → Resumen sin perder la vista.
- Capturas y mediciones en `tmp/resumen-*.png` y `tmp/resumen-browser-results.json`, ignoradas por Git. No demuestran persistencia ni permisos reales de Supabase.
- Build de producción; se mantiene la advertencia existente del presupuesto del paquete inicial.

Resultado final: **409 tests aprobados en 47 archivos** y build de producción correcto. Advertencia de paquete inicial: 913,05 kB frente al presupuesto de aviso de 500 kB.

No hubo pruebas reales de persistencia tras editar en Supabase ni cambios sobre datos reales. No se hicieron commit ni push.
