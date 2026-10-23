# Mejoras integrales de UX/UI

Entrega local del 22/10/2026. Se conservaron los cambios que ya estaban en el árbol de trabajo. Este documento enumera las modificaciones de esta tarea, no atribuye los cambios previos a esta entrega.

## Implementación

1. Notificaciones: servicio común con éxito, error, advertencia e información; iconos, cierre, duración, anuncios accesibles y supresión de repeticiones inmediatas. Integración en guardados de alumnos/configuración mensual, cuotas, pagos, eliminaciones, generación mensual, validaciones y fallos de carga. Los éxitos se emiten después de recibir la confirmación y actualizar los datos; los resultados de generación se anuncian como información para no presentar lotes parciales o revertidos como éxitos completos. Los errores conocidos se traducen sin mostrar SQL, nombres de funciones o códigos internos.
2. Listados: ordenamiento Material en Alumnos y Cuentas; comparador numérico y de texto español, fechas ISO cronológicas, indicadores de dirección y estado de orden en los servicios para sobrevivir a CRUD y navegación. El historial de pagos suma búsqueda y selector de orden. La tabla resumida del Dashboard permite ordenar sus ocho filas actuales sin alterar el criterio que selecciona esas filas.
3. Cambios sin guardar: servicio y guard compartidos para los diálogos de alumnos, configuración mensual incluida en ese formulario, cuotas y pagos. Comparación contra valores iniciales, cancelación, Escape, fondo del diálogo, rutas y advertencia nativa de recarga/cierre. Los formularios bloquean salida durante guardado/confirmación y se liberan al guardar correctamente. closeOnNavigation=false en las aperturas de formularios evita que el historial del navegador descarte el diálogo antes del guard.
4. Navegación: accesos desde Dashboard y métricas, enlaces de alumno a sus cuentas, validación de parámetros una vez disponibles los datos autorizados y limpieza de filtros incompatibles al aplicar un contexto explícito. Los filtros modificados luego no se sobrescriben al refrescar. Cuotas y pagos siguen compartiendo la sección existente.
5. Pendientes: nueva ruta /pendientes bajo las mismas comprobaciones de sesión y autorización. Reutiliza CuentasService y su snapshot autorizado, sin agregar consultas ni repositorios. Excluye saldos cero y usa los saldos financieros existentes. Categorías excluyentes: vencidas; vencen hoy o en siete días; parciales posteriores; otros saldos. Una cuota parcialmente pagada y vencida figura en Vencidas, con indicación de pago parcial; se evita contarla dos veces. Orden por vencimiento e ID. Fecha civil argentina tomada de service.hoy(), con suma de días de calendario sin conversiones horarias del vencimiento.
6. Carga y presentación: reutilización de skeletons, botones existentes de guardado y deshabilitación de acciones. Pendientes diferencia carga, guardado, error con reintento, ausencia de datos y búsquedas vacías. Dashboard ofrece reintento sin recargar la página. Estilos de foco, números tabulares, formularios de búsqueda, distribución móvil y respeto por movimiento reducido.

## Archivos de esta tarea

Nuevos:

- src/app/core/services/toast-service.ts
- src/app/core/services/orden-tabla.ts
- src/app/core/services/cambios-pendientes.ts
- src/app/core/services/pendientes.ts
- src/app/core/services/ux.spec.ts
- src/app/features/pendientes/pendientes.ts
- src/app/features/pendientes/pendientes.html
- src/app/features/pendientes/pendientes.scss
- src/app/features/pendientes/pendientes.spec.ts
- src/app/features/cuentas/navegacion-contextual.spec.ts
- docs/mejoras-ux-integrales.md

Modificados, conservando contenido previo:

- src/app/app.routes.ts
- src/app/core/services/alumnos-remotos-service.ts
- src/app/core/services/cuentas-remotas-service.ts
- src/app/features/alumnos/alumnos.ts
- src/app/features/alumnos/alumnos.html
- src/app/features/alumnos/alumno-form.ts
- src/app/features/alumnos/alumno-form.spec.ts
- src/app/features/alumnos/alumno-ficha.ts
- src/app/features/cuentas/cuentas.ts
- src/app/features/cuentas/cuentas.html
- src/app/features/cuentas/cuenta-form.ts
- src/app/features/cuentas/cuenta-form.spec.ts
- src/app/features/cuentas/cuota-detalle.ts
- src/app/features/cuentas/cuota-detalle.html
- src/app/features/cuentas/cuota-detalle.scss
- src/app/features/cuentas/generar-mensual.ts
- src/app/features/cuentas/generar-mensual.spec.ts
- src/app/features/dashboard/dashboard.ts
- src/app/features/dashboard/dashboard.html
- src/app/features/dashboard/dashboard.spec.ts
- src/app/layout/admin-shell/admin-shell.ts
- src/app/shared/stat-card/stat-card.ts
- src/app/shared/stat-card/stat-card.html
- src/app/shared/stat-card/stat-card.scss
- src/app/shared/skeleton/skeleton.spec.ts
- src/styles.scss

## Validación

- npm test -- --watch=false: 23 archivos, 197 pruebas aprobadas.
- npm run build: producción completada, salida dist/rochy-hub.
- Advertencia del build: bundle inicial de 896,54 kB frente al umbral de advertencia de 500 kB; permanece bajo el límite de error de 1 MB. No se aumentaron los presupuestos.
- git diff --check: sin errores de whitespace. Git avisa de normalización LF/CRLF en archivos del árbol de trabajo.
- Pruebas nuevas de Toast, ordenamiento, categorías/saldos mínimos, cambio de año, cambios revertidos, cancelación, descarte, bloqueo de navegación durante guardado, advertencia beforeunload, navegación contextual y carga/error/vacío de Pendientes. Se conservaron las pruebas de confirmación del servidor e aislamiento con repositorios simulados.

Las verificaciones se realizaron localmente, con mocks y jsdom. No se realizó una sesión visual autenticada ni operaciones remotas. La revisión visual móvil/oscura y el aislamiento real con dos administradores quedan para comprobación manual en el entorno autorizado; las pruebas locales no sustituyen esa comprobación. La optimización adicional del bundle queda como mejora posterior.

## Cómo probar visualmente

1. Ejecutar npm start y abrir http://localhost:4200/#/dashboard con una cuenta autorizada. Probar escritorio, 768 px y 390 px, tema claro y oscuro, navegación por teclado y foco.
2. Desde Dashboard, seguir los accesos a Alumnos, Cuentas del período y Pendientes. Desde la ficha de un alumno, abrir sus cuentas y comprobar que se muestra ese alumno sin filtros anteriores incompatibles.
3. Pulsar encabezados de Alumnos/Cuentas para ascendente, descendente y orden original. Probar importes como 9 y 100, fechas de distintos meses y nombres con acentos. Buscar y filtrar; comprobar que el estado se conserva al abrir/cerrar diálogos y volver a la sección.
4. Editar un campo de alumno/configuración mensual, cuota o pago sin guardar. Probar Cancelar, Escape, clic fuera, Atrás y recarga. Elegir Continuar editando; repetir y descartar. Revertir el campo al valor original y comprobar que no pide confirmación. Las advertencias nativas dependen de que el navegador haya registrado interacción del usuario.
5. En Pendientes, comprobar categorías, búsqueda, saldo total y detalle frente a los datos existentes. Las pagadas no aparecen; las vencidas con abonos se cuentan una sola vez. Las próximas incluyen el día actual y los siete siguientes.
6. Usar el modo offline de las herramientas del navegador y pulsar Actualizar: comprobar error y reintento, sin importes ficticios. Restaurar red y reintentar. Revisar skeletons con conexión lenta.
7. Para comprobar guardado, eliminación y actualización de saldos, usar solamente el entorno de prueba autorizado: esas acciones modifican datos. Esperar a la confirmación del servidor antes del mensaje de éxito y comprobar que no permite doble envío.

No se modificaron SQL, RLS, Auth, reglas de administración, dependencias, configuración de hash routing ni reglas financieras. No se ejecutó SQL ni scripts contra Supabase; no hubo commit, push, despliegue o modificaciones de datos remotos.

## Revisión para publicación en GitHub

Se revisó el conjunto pendiente y se seleccionaron código, estilos, pruebas y documentación de UX. Se excluyen SQL, archivos privados, scripts de migración/verificación remota y respaldo, documentación operativa de 005/backups y el cambio de texto independiente de la sección Rochy. No se modificaron Auth ni RLS. La revisión de patrones de credenciales en los 68 archivos candidatos no detectó alertas. Se retiró un carácter BOM que precedía al selector SCSS compartido .table-card.

Validación previa al commit: 197 pruebas Angular y 6 pruebas de inicialización de tema aprobadas; build de producción con --base-href /rochi.entrena/ correcto. El build final también se comprobó excluyendo temporalmente el cambio local de Rochy, que fue restaurado íntegramente después. Se mantiene el aviso de 896,54 kB frente al umbral de 500 kB. El workflow deploy-pages.yml publica automáticamente al recibir un push a main; no se requiere invocarlo manualmente.
