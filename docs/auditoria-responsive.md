# Auditoría responsive — TusCuentasFacil

Se corrigió la presentación sin cambiar servicios, consultas, cálculos, autenticación ni SQL.

## Problemas encontrados

- El mixin de tablas cambiaba `table`, `tbody`, filas y celdas a bloques/grillas en celular. Combinado con `table-layout: fixed`, anchos de acciones y `overflow-wrap: anywhere`, producía columnas comprimidas y palabras cortadas letra por letra.
- El encabezado intentaba compactar `.user__name`, pero el componente utiliza `.user__details`. El email competía por el ancho con el título y los botones.
- En Centro de pendientes, combinar dirección vertical y `flex-wrap` con `flex-basis: 100%` podía ubicar acciones fuera de la tarjeta.
- Historiales y formularios tenían mínimos de ancho innecesarios; los campos de período conservaban dos columnas.
- El pie absoluto del sidebar podía superponerse al menú en pantallas bajas.

## Cambios

- Alumnos y Cuotas y cobros: tablas de escritorio y tarjetas móviles como hermanos, sin tarjetas dentro de filas/celdas. Ambas usan las mismas señales, filtros, orden y métodos de acción. El cambio ocurre a 850 px; la tabla de escritorio conserva desplazamiento local cuando necesita más espacio.
- Dashboard: presentación móvil separada para las deudas, con ordenamiento disponible.
- Vista previa de generación mensual: tarjetas móviles separadas de la tabla.
- `MobileSort`: control reutilizado por Alumnos, Cuotas y Dashboard, sin estado financiero ni copia del orden.
- Mixin de tablas: estilos comunes de tarjetas y acciones táctiles. Centro de pendientes e historial de pagos conservan sus tarjetas existentes.
- Header compacto, email oculto en celular, título adaptable y cierre de sesión accesible; sidebar con ancho adaptable y pie en el flujo.
- Ajustes de diálogos, formularios, historial de pagos, Configuración, autenticación, skeletons y contenedores compartidos. Se revisaron Guía de uso y Te quiero, Rochi. No cambió navegación ni contenido de la Guía.

## Validación

Se usó Edge headless con componentes Angular reales y un bootstrap aislado en `tmp/`, con fixtures locales y repositorios de prueba. No se utilizó la sesión del usuario ni se realizaron escrituras en Supabase.

| Anchos en CSS px | Pantallas | Diálogos |
| --- | --- | --- |
| 320, 375, 390, 430, 768, 1024, 1440 | Alumnos, Cuotas, Dashboard, Pendientes, Guía, Configuración, Rochi, Login, acceso no autorizado y recuperación de contraseña | Alta con mensualidad habilitada, ficha, edición de alumno, registrar cobro, detalle e historial, nueva cuota y generación mensual |

- 70 controles de pantallas: sin desbordes de los elementos revisados fuera del viewport.
- 49 controles de diálogos: dentro del viewport, campos dentro de sus límites y sin desborde horizontal del diálogo.
- Navegación: apertura del menú, seis opciones en el orden actual, cierre al navegar y cierre de sesión con el proveedor de prueba.
- Suite: 280 pruebas aprobadas, incluyendo ordenamiento de tarjetas. Los tests existentes cubren filtros, ABM, configuración mensual, pagos y navegación contextual.
- Build de producción exitoso. Persiste el aviso de presupuesto inicial: aproximadamente 904 kB frente a 500 kB; no bloquea la compilación.

Capturas y mediciones de esta sesión están en `tmp/responsive-*.png`, `tmp/responsive-results.json` y `tmp/responsive-dialog-results.json` (archivos locales ignorados por Git).

## Comprobación manual recomendada

1. Abrir Alumnos a 375 px, buscar y filtrar, cambiar Ordenar por y su sentido. Verificar nombre completo y las acciones Ver ficha, Editar y Dar de baja/Reactivar.
2. Abrir Agregar alumno, habilitar cuota mensual y revisar importe, vencimiento, primera cuota y período. Desplazarse dentro del formulario hasta los campos y usar Cancelar.
3. Abrir Cuotas y cobros y cambiar filtros; revisar total, abonado, saldo y estado de la tarjeta. Abrir Registrar cobro y Ver detalle e historial.
4. Abrir Centro de pendientes, cambiar categoría/búsqueda y comprobar los botones de cada tarjeta.
5. Abrir el menú, recorrer Guía, Configuración y Rochi. Comprobar Cerrar sesión en un entorno autorizado.
6. Repetir en escritorio: tablas, encabezados ordenables y todas las acciones deben permanecer disponibles.

## Límites

Las pruebas de navegador fueron con viewports emulados, no con dispositivos físicos ni teclado virtual de iOS/Android. Las comprobaciones visuales no prueban escrituras reales en Supabase: no se guardaron alumnos ni pagos en la base. Debe completarse esa aceptación en un entorno de prueba autorizado. La validación de recuperación de contraseña cubrió la presentación del enlace inválido; los flujos de sesión se mantienen cubiertos por los tests existentes.
