# Organización del alta y edición por secciones

## Alta

Datos básicos permanece visible. Información adicional, Configuración mensual, Perfil de entrenamiento y Documentos usan el mismo `mat-expansion-panel`, `hub-filter-extra` y la variante compartida `hub-optional-sections`. Las cuatro secciones empiezan cerradas en el alta, con el mismo encabezado, indicador “(opcional)”, borde, padding e icono Material.

La variante compartida usa design tokens: separación vertical de 16 px; altura mínima uniforme de 64 px en desktop/tablet y 88 px en mobile, para admitir encabezados largos sin recortar texto. El formulario mantiene scroll vertical y acciones fuera del contenido desplazable. No se sobrescriben tamaños o estados de botones.

Configuración mensual contiene el checkbox, los campos condicionales y todos los textos explicativos. Conserva período, primera cuota y validaciones existentes. Si se intenta guardar con un campo mensual inválido, se abre ese panel para mostrarlo; no aparecen errores simplemente por habilitar la configuración sin tocar sus campos.

Se reutilizan `AlumnoForm`, `PeriodSelector`, `PerfilCampos` y `DocumentosAlta`, además de sus modelos, servicios y validadores. No se duplican campos ni componentes de subida. El alumno creado sigue conservándose ante fallos de perfil/documentos, con reintento solo de pasos pendientes.

## Ficha individual

| Sección | Consulta | Edición |
| --- | --- | --- |
| Datos personales | Resumen: nombre, apellido, modalidad, estado y fecha | Editar datos personales |
| Información adicional | Resumen: teléfono, email y observaciones | Editar información adicional |
| Configuración mensual | Resumen: estado de habilitación, importe, vencimiento y período cuando existe | Editar configuración mensual |
| Perfil de entrenamiento | Pestaña Entrenamiento: datos informados y estado pendiente si está vacío | Editor existente, con todos los campos opcionales |
| Documentos | Pestaña Documentos: listado y estados | Adjuntar, descargar y eliminar con confirmación, mediante el componente existente |

Las tres primeras acciones abren **el mismo AlumnoForm**, mostrando y habilitando solo los controles de la sección elegida. El guardado combina esos valores con los demás datos actuales del servicio, conservando las otras secciones. Perfil y documentos conservan sus editores existentes. Los datos sin completar se identifican como tales, sin valores ficticios.

La primera cuota es una acción exclusiva del alta: al editar la configuración no se vuelve a generarla ni se alteran cuotas históricas. Las cuotas existentes se consultan y gestionan desde Finanzas/Cuotas y cobros, como antes.

## SQL existente

Esta tarea no agrega ni ejecuta migraciones y no cambia RLS, autenticación o tablas financieras. Documentos depende de 012; la selección de archivos antes del alta usa la lectura de configuración de 013. Entrenamiento depende de 014. No se verificó remotamente si esas migraciones ya fueron aplicadas. Los errores de lectura/escritura siguen mostrándose; no se presentan operaciones simuladas como éxitos reales.

## Verificación

- Suite completa con concurrencia limitada: `npm test -- --watch=false --runner-config=tmp/vitest-documentos.config.mjs`. La configuración local limita concurrencia sin aumentar timeouts.
- Alta mínima, adicionales, mensual/primera cuota, perfil y documentos; reintentos parciales sin duplicar alumnos; validaciones y estados de error. Pruebas nuevas de estructura de cuatro paneles y ediciones por sección que conservan el resto de los valores, incluido un cambio de datos recibido por el servicio mientras el editor está abierto.
- Regresión de consultas/edición de perfil, valores NULL/No/cero, documentos, cálculos financieros, filtros y navegación existentes.
- Edge headless con componentes reales y servicios ficticios a 320×640, 375×812, 768×1024 y 1440×900: encabezados uniformes y separación, todos los paneles abiertos, teclado, scroll, ausencia de errores prematuros y de desbordamiento horizontal. Footer accesible y apertura/cancelación de los tres editores contextuales en cada tamaño.
- Evidencia local en `tmp/secciones-alta-*.png` y `tmp/secciones-browser-results.json`, ignorada por Git. Estos resultados no prueban persistencia ni permisos del servicio Supabase real.
- Build de producción, con la advertencia existente del presupuesto inicial.

Resultado final: **405 tests aprobados en 47 archivos** y build de producción correcto. Advertencia de bundle inicial: 913,05 kB frente a 500 kB de presupuesto de aviso.

No hubo pruebas reales de persistencia/RLS tras recargar Supabase, cambios en datos reales, commit, push ni deploy. Las verificaciones manuales del backend siguen documentadas en `documentos-alumnos.md` y `perfiles-entrenamiento.md`.
