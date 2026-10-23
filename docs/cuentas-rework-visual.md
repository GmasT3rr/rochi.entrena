# Cuentas y pagos: acciones y detalle

La tabla conserva todas las columnas y acciones. Usa importes alineados, separación compacta, hover y botones con iconos/tooltips. Por debajo de 1100 px, edición/pago/eliminación pasan a un menú; por debajo de 850 px, cada fila se presenta como una ficha de dos columnas con etiquetas, sin imponer el ancho anterior de 1200 px. Se retiraron los textos técnicos de esta pantalla.

El icono de papelera abre ConfirmarEliminarCuota, compartido con el detalle. Identifica alumno, concepto, período e importe, con Cancelar como foco inicial y Eliminar destacado. Las cuotas con pagos tienen la acción deshabilitada y una explicación accesible por tooltip o texto en el menú. No se elimina al abrir ni al cancelar.

La confirmación conserva la versión de cuota que se mostró. Al aceptar llama al servicio existente `eliminarCuota(id, version)`: este vuelve a comprobar pagos en memoria; el repositorio exige autorización y envía DELETE condicionado a revisión y actualizado_en. Un pago concurrente incrementa la revisión por el trigger existente; además, la FK de pagos usa RESTRICT. El servidor rechaza una eliminación conflictiva, sin cascada. No se cambiaron SQL, políticas, triggers, repositorios ni cálculos.

El servicio existente confirma la escritura y relee el snapshot antes de anunciar éxito; tabla, detalle e indicadores del Dashboard consumen ese mismo estado. Ante conflicto o error no se anuncia éxito y se exige actualizar cuando el estado queda incierto. No se reintenta una eliminación automáticamente.

El detalle conserva todos sus campos, edición de cuota, registro/edición/eliminación de pagos, eliminación de cuota sin pagos y actualización manual. Se reorganizó en resumen, acciones e historial, con cierre superior accesible, scroll interno y estilos de ambos temas. Abrirlo ya no ejecuta una recarga completa: reutiliza el snapshot disponible. Las operaciones de modificación mantienen la relectura existente.

Validación: 182 tests en 19 archivos y build de producción correcto; continúa el aviso de bundle inicial (792,31 kB frente a 500 kB). Las nuevas pruebas cubren cancelación, identificación de cuota, espera de confirmación del servidor, versión conservada, bloqueo con pagos, rechazo simulado de conflicto y detalle sin recarga ni historial. Se mantienen las pruebas de repositorio y servicio financiero existentes. Pendiente: conflicto real con dos sesiones, revisión visual autenticada en móvil/escritorio y ambos temas; no se borraron datos remotos durante esta implementación.

No hubo commit, push ni deploy.
