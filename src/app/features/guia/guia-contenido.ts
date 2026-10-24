export interface ExplicacionGuia {
  id: string;
  titulo: string;
  icono: string;
  pasos: readonly string[];
  aclaracion?: string;
  ruta: string;
  enlace: string;
}

// Mantener los pasos y nombres de botones alineados con las pantallas existentes.
export const explicacionesGuia: readonly ExplicacionGuia[] = [
  {
    id: 'agregar-alumno',
    titulo: '¿Cómo agrego un alumno?',
    icono: 'person_add',
    pasos: [
      'Entrá en Alumnos.',
      'Seleccioná Agregar alumno.',
      'Completá sus datos personales, modalidad y fecha de ingreso.',
      'Si habilitás el cobro mensual, revisá el primer período y Crear primera cuota al guardar.',
      'Seleccioná Guardar y esperá el mensaje que indica si se creó la primera cuota.',
    ],
    aclaracion: 'Podés modificar sus datos más adelante.',
    ruta: '/alumnos',
    enlace: 'Ir a Alumnos',
  },
  {
    id: 'cobro-mensual',
    titulo: '¿Cómo configuro el cobro mensual?',
    icono: 'event_repeat',
    pasos: [
      'Al agregar o editar un alumno, buscá Configuración de cobro.',
      'Marcá Habilitar cuota mensual.',
      'Completá Importe mensual en ARS y Día de vencimiento.',
      'Si es un alumno nuevo, elegí el primer período y dejá marcada Crear primera cuota al guardar si querés crearla ahora.',
      'Seleccioná Guardar.',
    ],
    aclaracion:
      'Editar la configuración no crea cuotas ni cambia las anteriores. En un alta podés crear la primera cuota, pero el pago se registra aparte. Si el día no existe en el mes, se usa el último día.',
    ruta: '/alumnos',
    enlace: 'Ir a Alumnos',
  },
  {
    id: 'generar-cuotas',
    titulo: '¿Cómo genero cuotas de otros períodos?',
    icono: 'calendar_month',
    pasos: [
      'Entrá en Cuotas y cobros y seleccioná Generar cuotas del mes.',
      'Elegí el Período y seleccioná Actualizar vista previa.',
      'Revisá las cuotas por generar y los alumnos omitidos.',
      'Marcá Confirmo la generación de estas cuotas.',
      'Seleccioná Confirmar generación y esperá el resultado.',
    ],
    aclaracion:
      'Mientras la administración termina de validar la automatización, este botón sigue disponible. Después, usá la recuperación de Configuración solo si faltan cuotas. No se duplican cuotas existentes.',
    ruta: '/cuentas',
    enlace: 'Ir a Cuotas y cobros',
  },
  {
    id: 'cuotas-automaticas',
    titulo: '¿Cómo verifico las cuotas automáticas del mes?',
    icono: 'event_repeat',
    pasos: [
      'Una vez activada y validada por la administración, la tarea crea las cuotas al comenzar cada mes, según la fecha de Argentina.',
      'Entrá en Cuotas y cobros y elegí el Período actual.',
      'Buscá al alumno y revisá importe y vencimiento.',
      'Para controlar deudas de todos los meses, abrí el Centro de pendientes.',
      'Si falta una cuota, avisá a la administración. En Configuración, Herramientas administrativas permite Revisar cuotas faltantes antes de confirmar.',
    ],
    aclaracion:
      'Se incluyen alumnos activos con cobro mensual habilitado desde su primer período a cobrar. Se reintenta diariamente el mes actual; los meses anteriores requieren revisión. Generar una cuota no registra un pago. La activación de esta tarea todavía requiere validación en Supabase.',
    ruta: '/cuentas',
    enlace: 'Ir a Cuotas y cobros',
  },
  {
    id: 'primera-cuota',
    titulo: '¿Cómo creo la primera cuota al agregar un alumno?',
    icono: 'event_available',
    pasos: [
      'En Agregar alumno, marcá Habilitar cuota mensual y completá importe y día de vencimiento.',
      'Dejá marcada Crear primera cuota al guardar.',
      'Elegí Primer período a cobrar (mes y año).',
      'Seleccioná Guardar: se guardan el alumno, su configuración y una sola cuota juntos.',
      'Para cobrarla, entrá en Cuotas y cobros, elegí ese período y usá Registrar cobro.',
    ],
    aclaracion:
      'Si desmarcás la opción, no se crea una cuota al guardar. Con la tarea automática activada podrá crearse desde el primer período elegido en la próxima ejecución. No se registra un pago ni se generan meses anteriores.',
    ruta: '/alumnos',
    enlace: 'Ir a Alumnos',
  },
  {
    id: 'registrar-cobro',
    titulo: '¿Cómo registro un cobro?',
    icono: 'payments',
    pasos: [
      'Entrá en Cuotas y cobros y buscá al alumno.',
      'Seleccioná Registrar cobro en la cuota con saldo pendiente.',
      'Revisá los datos: vienen cargados el saldo completo, la fecha de hoy y el medio de pago.',
      'Si cobrás una parte, cambiá el importe y revisá el Saldo resultante.',
      'Seleccioná Registrar cobro y esperá la confirmación.',
    ],
    aclaracion:
      'Si hay un error, tus datos quedan en el formulario. Usá Actualizar datos y revisá si el pago aparece antes de reintentar.',
    ruta: '/cuentas',
    enlace: 'Ir a Cuotas y cobros',
  },
  {
    id: 'consultar-deudas',
    titulo: '¿Cómo veo quién debe?',
    icono: 'account_balance_wallet',
    pasos: [
      'En el Dashboard, seleccioná Ver todos los pendientes o Centro de pendientes · Todos los períodos.',
      'Revisá el Saldo total pendiente de todos los meses.',
      'Elegí Todos, Vencidas, Próximas a vencer, Parciales u Otros saldos.',
      'Buscá por alumno o concepto y seleccioná Ver cuota y pagos para revisar el historial.',
    ],
    aclaracion:
      'Cada cuota se cuenta una sola vez. Las vencidas con abonos indican Con pagos parciales. La búsqueda y las categorías no cambian el total general.',
    ruta: '/pendientes',
    enlace: 'Ir al Centro de pendientes',
  },
  {
    id: 'editar-alumno',
    titulo: '¿Cómo modifico un alumno?',
    icono: 'edit',
    pasos: [
      'Entrá en Alumnos y buscá a la persona.',
      'Seleccioná el ícono de lápiz: Editar alumno.',
      'Modificá la información.',
      'Seleccioná Guardar.',
    ],
    aclaracion: 'Cambiar el importe mensual no modifica las cuotas ya creadas.',
    ruta: '/alumnos',
    enlace: 'Ir a Alumnos',
  },
  {
    id: 'estado-alumno',
    titulo: '¿Cómo pauso o desactivo un alumno?',
    icono: 'person_off',
    pasos: [
      'Entrá en Alumnos y buscá a la persona.',
      'Seleccioná Editar alumno.',
      'En Estado, elegí En pausa o Inactivo.',
      'Seleccioná Guardar.',
    ],
    aclaracion:
      'No se incluirá en nuevas generaciones mensuales. Sus cuotas, pagos y deudas anteriores se conservan.',
    ruta: '/alumnos',
    enlace: 'Ir a Alumnos',
  },
  {
    id: 'corregir-cuota',
    titulo: '¿Cómo corrijo una cuota o un pago?',
    icono: 'receipt_long',
    pasos: [
      'Entrá en Cuotas y cobros y buscá la cuota.',
      'Abrí Ver detalle.',
      'Seleccioná Editar cuota o buscá el pago en Historial de pagos y seleccioná Editar pago.',
      'Corregí los datos y seleccioná Guardar. Si editás un pago, confirmá la corrección.',
    ],
    aclaracion:
      'Los pagos no pueden superar el importe de la cuota. Tampoco podés reducir una cuota por debajo de lo abonado.',
    ruta: '/cuentas',
    enlace: 'Ir a Cuotas y cobros',
  },
  {
    id: 'filtros-cuotas',
    titulo: '¿Cómo consulto cuotas y uso los filtros?',
    icono: 'filter_alt',
    pasos: [
      'Entrá en Cuotas y cobros: al comenzar se muestra el mes actual.',
      'En Período, elegí Mes y Año; para ver todo, seleccioná Todos los períodos en Mes. Buscá por nombre de alumno.',
      'Combiná Alumno, Estado y Modalidad; en celular, abrí Filtrar por alumno para elegir uno.',
      'Abrí Ver detalle e historial con el ícono del ojo; al cerrar se conservan tus filtros.',
      'Usá Limpiar filtros para ver todas las cuotas. Actualizar está junto a la cantidad de resultados.',
    ],
    aclaracion:
      'Total cobrado cuenta pagos recibidos en el período elegido. Total pendiente es el saldo de sus cuotas e incluye Total vencido. Los demás filtros solo cambian el listado.',
    ruta: '/cuentas',
    enlace: 'Ir a Cuotas y cobros',
  },
  {
    id: 'dashboard',
    titulo: '¿Para qué sirve el Dashboard?',
    icono: 'dashboard',
    pasos: [
      'Elegí Mes y Año para consultar un período.',
      'Revisá Cobrado en el mes, Pendiente de cobro, Porcentaje de cobranza y Deuda vencida.',
      'Consultá la evolución de ingresos y los alumnos activos.',
      'Revisá Vencimientos y deudas o seleccioná Ver todos los pendientes para hacer seguimiento.',
    ],
    aclaracion:
      'Los cobros se agrupan por fecha de pago. Los saldos corresponden a las cuotas del período elegido; los alumnos activos muestran la situación actual.',
    ruta: '/dashboard',
    enlace: 'Ir al Dashboard',
  },
  {
    id: 'nueva-cuota',
    titulo: '¿Cómo creo una cuota individual?',
    icono: 'add_card',
    pasos: [
      'Entrá en Cuotas y cobros y seleccioná Nueva cuota.',
      'Elegí el Alumno y completá Concepto, Mes y Año.',
      'Indicá Importe total (ARS) y Vencimiento.',
      'Seleccioná Guardar.',
    ],
    aclaracion: 'Crear una cuota deja un saldo por cobrar. Registrá el pago cuando lo recibas.',
    ruta: '/cuentas',
    enlace: 'Ir a Cuotas y cobros',
  },
  {
    id: 'pendientes',
    titulo: '¿Cómo registro un cobro desde el Centro de pendientes?',
    icono: 'task_alt',
    pasos: [
      'En el Centro de pendientes, buscá la cuota por alumno o concepto.',
      'Seleccioná Registrar pago en su tarjeta.',
      'Revisá importe, fecha y medio. Podés cambiar el importe para cobrar solo una parte.',
      'Seleccioná Registrar cobro y esperá la confirmación.',
      'El saldo se actualiza; si queda pagada, desaparece de los pendientes.',
    ],
    aclaracion:
      'Ver cuota y pagos permite corregir o eliminar pagos con confirmación. Los saldos se actualizan sin perder tus filtros. Ante un error, usá Actualizar y revisá el resultado antes de repetir un cobro.',
    ruta: '/pendientes',
    enlace: 'Ir al Centro de pendientes',
  },
  {
    id: 'configuracion',
    titulo: '¿Cómo cambio la apariencia o mi contraseña?',
    icono: 'settings',
    pasos: [
      'Entrá en Configuración.',
      'En Apariencia, elegí Tema: Claro, Oscuro o Automático (según sistema).',
      'Para cambiar la contraseña, completá Contraseña actual, Nueva contraseña y Confirmar nueva contraseña.',
      'Seleccioná Cambiar contraseña. Si se solicita, enviá e ingresá el código de verificación antes de confirmar.',
    ],
    aclaracion:
      'La contraseña debe tener entre 12 y 128 caracteres, con mayúsculas, minúsculas, números y símbolos. Podés terminar desde Cerrar sesión.',
    ruta: '/configuracion',
    enlace: 'Ir a Configuración',
  },
];
