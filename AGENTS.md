# Convenciones de frontend — TusCuentasFacil

Antes de crear cualquier botón, input, selector, formulario, modal, tarjeta, badge, Toast, skeleton o elemento de interfaz, revisar los componentes compartidos existentes en src/app/shared y los estilos globales.

- Reutilizar los componentes y estilos del sistema de diseño y Angular Material. Si se necesita una variante, extender lo existente de forma mantenible. No duplicar implementaciones visuales.
- Mantener coherencia entre desktop y mobile. Todo nuevo módulo debe respetar los design tokens y las convenciones visuales de TusCuentasFacil.
- No introducir nuevas bibliotecas visuales sin necesidad justificada.
- Botones: Material flat (primary), stroked (secondary), text (tertiary); clase hub-danger para acciones destructivas. Usar los tamaños y estados globales, sin sobrescribirlos por pantalla.
- Selecciones: mat-form-field outline + mat-select. Períodos mensuales: app-period-selector (YYYY-MM, ControlValueAccessor); fechas completas conservan su control de fecha.
- Reutilizar PageHeader, MobileSort, LoadingLayout, Skeleton y ToastService. Los estilos comunes están en shared/_visual-system.scss y shared/_data-table.scss; los breakpoints en shared/_breakpoints.scss.
- Conservar tablas de escritorio y tarjetas móviles separadas, con la misma fuente de datos y métodos de acción. No insertar tarjetas en celdas.
- Probar componentes compartidos y sus consumidores, teclado y tamaños desde 320 px; ejecutar tests y build. No cambiar lógica de negocio para resolver presentación.
