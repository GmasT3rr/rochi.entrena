# Skeleton loading

## Auditoria

Los layouts compartidos ya existian, pero desaparecian al finalizar la consulta, sin minimo visual. Dashboard y Pendientes tambien sustituian el contenido durante guardados. Cuentas ocultaba los datos en cada recarga; la ficha de alumno usaba solamente un texto para cargar sus finanzas. Los breakpoints del skeleton no coincidian con los listados (850 px).

Las lecturas iniciales de Supabase estan centralizadas en AlumnosService y CuentasService. Los filtros son locales: no necesitan nuevas consultas. La vista previa mensual conserva su indicador textual, sin espera artificial. Formularios, autenticacion y validaciones conservan sus estados operativos.

## Implementacion

shared/skeleton/MinimumLoading mantiene una senal exclusivamente visual. begin(inicial) registra performance.now() y devuelve una funcion de finalizacion. El servicio inicia inmediatamente su consulta y llama esa funcion en finally, tanto ante exito como ante error. Si transcurrieron menos de 750 ms, programa solamente el tiempo restante; si la consulta tardo mas, retira el skeleton inmediatamente. No retrasa la publicacion de datos, la resolucion de la consulta ni las escrituras.

cargandoInicial controla los skeletons; cargando describe la solicitud real. listadoCargado y tieneDatos representan una lectura confirmada, incluso vacia. Nunca se deduce carga a partir de la cantidad de registros. Las recargas conservan el contenido y muestran un estado textual discreto. Los errores conservan sus mensajes y acciones de reintento. Una recarga financiera fallida conserva el snapshot anterior, excepto ante acceso denegado; el error mantiene su rama de presentacion propia.

Cada servicio tiene su reloj independiente. Las generaciones existentes impiden publicar respuestas antiguas; el reloj tambien ignora finalizaciones anteriores. Se cancelan los temporizadores al reiniciar el contexto o destruir el servicio. Una recarga secundaria no acorta un minimo visual ya iniciado. Los servicios son singleton: navegar entre consumidores comparte el estado de la solicitud, sin agregar una espera por ruta.

Se reutilizan Skeleton, LoadingLayout, PageHeader, los controles Material y los mensajes existentes de ToastService. Se amplia LoadingLayout con informacion personal para ficha y resumen financiero para cuentas. Se mantienen aria-busy, texto con role=status, decoracion oculta a lectores de pantalla, reduced-motion, temas y breakpoint compartido de 850 px.

Pantallas: Dashboard, Alumnos, ficha de alumno, Cuotas y cobros (incluidos cobros directos), detalle de cuota/historial y Centro de pendientes. No se cambiaron SQL, RLS, autenticacion, calculos financieros ni dependencias visuales.

## Verificacion

- Reloj simulado: 100, 500, 750 y 2000 ms; error, resultado vacio, recarga secundaria, finalizaciones antiguas y cancelacion. Consulta inmediata y duracion visual max(750 ms, duracion real).
- Pruebas de consumidores y servicios, incluidas operaciones financieras durante el minimo visual y conservacion del Dashboard durante recargas y guardados.
- Edge headless con los cinco layouts Angular reales en una vista aislada, tema oscuro: 320, 375, 768 y 1440 px, sin overflow horizontal ni excepciones. aria-busy presente, ningun control enfocable en placeholders y animacion desactivada con prefers-reduced-motion. Evidencia local ignorada por Git: tmp/skeleton-results.json y tmp/skeleton-375.png.
- Suite Angular completa: 309 tests en 37 archivos, todos correctos. Build de produccion correcto. El build advierte sobre el presupuesto inicial (aproximadamente 911 kB frente al aviso de 500 kB).

La comprobacion de navegador se limita a los layouts compartidos: no se probo una sesion autenticada contra Supabase ni se midio CLS de las pantallas completas. No se hicieron commits ni push.
