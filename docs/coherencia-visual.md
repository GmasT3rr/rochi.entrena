# Estructura visual compartida

Dashboard, Alumnos, Cuentas y Configuración utilizan PageHeader para títulos/subtítulos, con la misma separación del contenido. El selector del Dashboard se proyecta en el área de acciones del encabezado; su lógica permanece intacta. El contenedor del shell aplica el padding común y adaptativo de todas las rutas.

Las variables de sección, padding y radio de tarjeta centralizan criterios de espaciado. Alumnos y Cuentas usan el mixin compartido `shared/_data-table.scss`: encabezados, celdas, importes, bordes, hover, acciones, estados y adaptación de tabla a fichas. Las cuatro columnas y operaciones de Alumnos se mantienen; sus botones ahora tienen iconos con tooltip y nombres accesibles.

Configuración usa una cuadrícula con Apariencia/Sesión en una columna y Seguridad en la otra; por debajo de 900 px se apilan. Los títulos de sección están dentro de las tarjetas, los campos de contraseña tienen ancho máximo y los controles existentes conservan formularios, validaciones, estados y eventos.

El encabezado global muestra iniciales, Administrador y email reactivo de la sesión existente. No consulta Supabase. Se oculta el bloque cuando no hay correo de sesión y se recalcula al cambiar de usuario. El texto se trunca visualmente y el tooltip Material permite consultar el valor completo; los lectores de pantalla conservan el texto. En celular se reduce la tipografía y se oculta la etiqueta de rol para conservar espacio. No se modificaron rutas ni sidebar.

No se cambiaron autenticación, reglas financieras, servicios de persistencia, SQL, RLS ni Supabase. Los estilos usan la paleta existente para ambos temas. No hubo commit, push ni deploy.

Se ejecutaron tests y build. La prueba nueva verifica cambio de correo/iniciales y retirada de datos al terminar la sesión. La comprobación visual autenticada de alineaciones, desbordes y responsive real queda pendiente en escritorio/notebook/tablet/celular; la revisión de CSS y las pruebas DOM no sustituyen esa inspección. El build conserva la advertencia del presupuesto inicial (862,52 kB frente a 500 kB); incorporar tooltips al shell mueve su soporte al bundle inicial.
