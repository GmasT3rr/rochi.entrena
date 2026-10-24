# Sistema visual de TusCuentasFacil

Se conserva Angular Material, la identidad violeta, los temas existentes, las tablas de escritorio y las tarjetas móviles. La regla permanente para agentes está en `AGENTS.md`.

## Auditoría y consolidación

Se encontraron controles de selección nativos mezclados con Material, selección de períodos duplicada en tres formatos, botones con dimensiones y márgenes particulares, filtros con acciones dispersas y estilos de formularios repetidos.

- `src/app/shared/_visual-system.scss`: tokens de espacios, tipografía, radios, alturas, estados y transiciones; overrides públicos de Material; clases de filtros, acciones, errores y tarjetas.
- `src/app/shared/_breakpoints.scss`: puntos de corte compartidos. El mixin de tablas utiliza el mismo corte que las tarjetas móviles.
- `src/app/shared/_data-table.scss`: presentación reutilizada por Alumnos y Cuotas; conserva las dos vistas separadas y la misma fuente de datos.
- Se reutilizan PageHeader, MobileSort, LoadingLayout, Skeleton, ToastService y los diálogos de confirmación existentes. No se creó un sistema de loading o Toast paralelo.
- Se quitaron estilos de selectores nativos y duplicaciones de grillas de formulario. Los formularios de alumnos y cuotas usan la grilla global.

## Botones

| Variante | Implementación | Uso |
| --- | --- | --- |
| Primary | `mat-flat-button` o `matButton="filled"` | Guardar, agregar, registrar cobro |
| Secondary | `mat-stroked-button` | Cancelar, ver ficha, editar |
| Tertiary | `mat-button` | Actualizar, limpiar filtros |
| Danger | Clase `hub-danger` sobre el botón Material | Eliminar, dar de baja |

Todos reciben geometría, foco, estados y tipografía compartidos. El mínimo táctil es 44 px; los campos Material mantienen 56 px. Los botones de icono conservan su forma y etiqueta accesible. `aria-busy` muestra el indicador compartido en los guardados, usando los estados existentes y sus condiciones de disabled. El diálogo ConfirmarAlumno admite `data.danger` para distinguir confirmaciones destructivas sin depender del texto del título.

## Selectores

MobileSort y los filtros de historial usan ahora `mat-select` dentro de `mat-form-field` outline. La búsqueda de pendientes y del historial usan `matInput`. Se comparten foco violeta, radios, paneles, colores, opciones seleccionadas y distribución de acciones. Los paneles conservan scroll y navegación por teclado de Material.

## Períodos

`src/app/shared/period-selector.ts` es el único componente nuevo. Usa Mes y Año, conserva `YYYY-MM` y no convierte períodos a fechas completas. Reutiliza `periodoValido` del proyecto para los límites 1900–9999.

- Formularios: `<app-period-selector formControlName="periodo" />` o `[formControl]`.
- Filtros: `[value]` y `(periodChange)`; solo se notifican valores válidos.
- `allowAll`: habilita Todos los períodos en Mes y devuelve `''`, como el filtro existente de Cuotas.
- `label`: título accesible del grupo; `compact`: reduce el espacio del título en barras de filtros sin quitar su nombre accesible.
- `readonly` y disabled de Reactive Forms respetan los estados de guardado existentes.
- Los valores incompletos o inválidos se propagan al formulario para impedir guardar; las precargas no emiten cambios.

Consumidores: Dashboard, Cuotas y cobros, generación manual, primer período al dar de alta un alumno y nueva/edición de cuota. Vencimiento y fecha de pago mantienen sus controles de fecha y validaciones.

La Guía de uso se actualizó únicamente para indicar que Todos los períodos se elige dentro de Mes.

## Validación

- Suite: 286 pruebas, incluidas precarga, cambios de mes/año, límites, inválidos, touched, disabled, readonly, Todos y variantes de confirmación. Los tests de Dashboard y CuentaForm verifican integración y payload sin cambiar el contrato.
- Build de producción exitoso. Persiste el aviso de presupuesto inicial: aproximadamente 909 kB frente a 500 kB.
- Edge headless con bootstrap aislado, componentes reales y repositorios locales de prueba: diez pantallas a 320, 375, 390, 430, 768, 1024 y 1440 px; sin desbordes detectados en las mediciones.
- Siete diálogos a cada ancho: alta con mensualidad, ficha, edición, cobro, detalle/historial, nueva cuota y generación mensual; campos y contenedores dentro del viewport.
- Teclado en los siete anchos: abrir selector, Home/ArrowDown/Enter, Tab a Año, año 2075, Todos los períodos. Paneles dentro del ancho disponible y con scroll cuando corresponde.
- Se verificó visualmente la configuración mensual y su primera cuota en 375 px; también se comprobó el estado aria-busy/disabled y el indicador de guardado.

Los reportes y capturas de esta sesión están en `tmp/responsive-results.json`, `tmp/responsive-dialog-results.json`, `tmp/visual-system-interactions.json`, `tmp/visual-system-states.json` y `tmp/visual-system-*.png`. Son archivos locales ignorados por Git.

## Límites de la comprobación

Los tamaños se emularon en Edge, no en teléfonos físicos. Falta aceptación con teclado virtual de iOS/Android. Las pruebas de navegador usaron fixtures aislados: no validan autenticación ni guardados reales en Supabase. Los tests existentes de esos flujos pasaron; no se utilizaron credenciales reales ni se hicieron cambios en datos, consultas, SQL o RLS.
