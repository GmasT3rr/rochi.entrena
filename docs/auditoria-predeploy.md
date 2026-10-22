# Auditoría previa al primer deploy — 22/10/2026

## Dictamen

El artefacto compila y es compatible por configuración con GitHub Pages. No se encontraron bloqueantes de compilación ni credenciales privadas con los patrones revisados. Es candidato para una publicación de validación controlada, pero **no se certifica listo para operar con datos reales**: faltan pruebas de aceptación en navegador y del entorno remoto. No se hizo commit, push ni deploy; solo se agregó este informe.

## Comprobaciones ejecutadas

- 168 tests aprobados en 16 archivos; 6 pruebas adicionales del script de tema aprobadas.
- Build de producción con `/rochi.entrena/` correcto. El HTML generado contiene ese base href y `theme-init.js` existe. No se generaron source maps en la carpeta browser. `git diff --check` correcto.
- Revisión de workflow, angular.json, index/main/app config, rutas, Auth runtime/servicio/guard/autorización, seguridad de cuenta, repositorios y servicios de alumnos/cuentas, Dashboard, formularios, Configuración, tema y archivos históricos de respaldo.
- Búsqueda de patrones de claves privadas, Supabase secret/service_role JWT, tokens GitHub, claves AWS y conexiones PostgreSQL con contraseña: sin coincidencias en 149 archivos de trabajo/artefactos examinados. Búsqueda adicional de secretos/JWT en los 3 commits disponibles: sin coincidencias. Es una búsqueda acotada por patrones, no una garantía absoluta sobre todo posible secreto o historial remoto.
- `supabase.config.ts` contiene Project URL y publishable key configuradas; ambas son públicas. El runtime además exige el prefijo `sb_publishable_`. No se imprimieron valores.
- `.gitignore` excluye .env/variantes privadas, claves, logs, cachés y dist. No aparecieron archivos sensibles en la consulta de archivos seguidos para env/keys/Supabase. No se alteró el índice Git.
- `npm audit --omit=dev`: cero vulnerabilidades informadas. Auditoría completa: 2 paquetes afectados, Vite (alta) y @angular/build (baja por dependencia). No se ejecutó `audit fix`.

## 1. Bloqueantes / condiciones antes de operar con datos reales

No se demostró un fallo bloqueante del código en esta revisión. Quedan condiciones de aceptación que impiden dar una aprobación incondicional de producción:

1. **Auth en la URL final:** comprobar manualmente Site URL/Redirect URLs de Supabase para `https://gmast3rr.github.io/rochi.entrena/`, registro deshabilitado, login, recarga de sesión, logout y recuperación/cambio de contraseña. El código usa hash routing, procesa callbacks antes del router y construye el redirect desde document.baseURI. No se accedió a los ajustes remotos ni se enviaron correos/cambiaron contraseñas. Probar denegación anónima/noadmin, error de red y sesión administrativa. El usuario informó pruebas RLS satisfactorias; esta auditoría no las repitió.
2. **Aceptación visual y consola:** revisar navegador real en escritorio/móvil, ambos temas, navegación directa `/#/dashboard`, selectores Material, diálogos de cuota/pago/mensual, fechas DD/MM/AAAA, dashboard vacío/con datos y consola/red sin errores. No se ejecutó un navegador en esta sesión; las pruebas simuladas no acreditan ausencia de errores de consola ni contraste/responsive reales.
3. **Seguridad y recuperación de datos:** MFA/aal2 siguen pendientes del alcance anterior; no declarar completada esa protección. Antes de datos reales, definir y probar un respaldo/restauración del proyecto remoto. La app no ofrece respaldo completo de Supabase. La necesidad y calendario de MFA deben aceptarse explícitamente antes de operación real.

## 2. Recomendables

- Resolver los avisos de Vite/@angular/build mediante una actualización compatible y nueva suite. Afectan herramientas de desarrollo, no se demostró exposición de un servidor Vite en Pages (que solo sirve archivos estáticos). No exponer el servidor de desarrollo a redes no confiables. La propuesta automática de npm implica cambio de versión de Angular build: requiere revisión, no aplicar a ciegas. Aviso principal: https://github.com/advisories/GHSA-587h-7wmj-h5pm.
- Incorporar tests al workflow antes del build: actualmente npm ci y build no ejecutan la suite. Revisar que Pages esté configurado para GitHub Actions y permisos del entorno; el YAML no prueba la configuración de la cuenta ni una ejecución exitosa del workflow.
- Reducir bundle inicial: 787,90 kB frente al presupuesto orientativo de 500 kB; no supera el máximo de error de 1 MB.
- Actualizar documentos históricos de seguridad que todavía enumeran pruebas pendientes si ya se realizaron, conservando evidencia y fecha. El código SQL local no prueba qué versión está instalada en Supabase; confirmar RPC 001–004 instaladas según lo informado por el usuario.
- Probar las restricciones de sesiones y reautenticación del cambio de contraseña: el verificador usa login aislado sin persistencia, que consume límites y puede interactuar con políticas de sesión única. No se cambiaron políticas para facilitarlo.

## 3. Mejoras futuras

- Automatizar pruebas de navegador de rutas/callbacks, responsive, accesibilidad, tema y consola.
- Respaldos remotos y restauración ensayada; alertas operativas y revisión de escalabilidad de la lectura financiera completa.
- Retirar con planificación el código local histórico. Existe, pero las pantallas actuales no inyectan RespaldoService, AlumnosLocalService ni CuentasLocalesService; los exports activos apuntan a servicios remotos. No se detectó generación automática de mocks en el recorrido activo.

## Resultados funcionales de la revisión

Dashboard filtra un snapshot remoto por la preferencia YYYY-MM: cobros por fecha de pago, deudas/estados por período de cuota, alumnos actuales independientes. No lanza consultas por cada cambio de período; conserva estados de carga/error sin presentar ceros como éxito. Solo guarda la preferencia visual, no datos financieros.

Los formularios conservan períodos YYYY-MM y fechas civiles ISO para repositorios; su presentación es DD/MM/AAAA. Las validaciones financieras y triggers no se modificaron. Los repositorios exigen sesión y autorización, descartan respuestas de sesiones anteriores y no usan credenciales privilegiadas. Los guards fallan cerrados; RLS debe seguir siendo la barrera efectiva del servidor.

El modo oscuro se aplica antes del bootstrap, con tema Material para overlays y media queries responsive. Esto se verificó por código/compilación y tests, no por inspección visual.

Los respaldos antiguos solo trabajan con repositorios locales y no están expuestos en Configuración. No constituyen respaldo ni restauración de PostgreSQL; tampoco migran automáticamente ni sobrescriben los datos remotos.
