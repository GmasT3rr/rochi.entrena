# Centro de pendientes

La ruta `/pendientes` y su componente seguían presentes. Al ordenar el sidebar en la etapa de Guía de uso, se había retirado su entrada para mantener las seis opciones pedidas. El enlace superior del Dashboard seguía existiendo: no se encontró una eliminación de la pantalla ni de su ruta.

Se agregó un acceso explícito «Centro de pendientes · Todos los períodos» en el panel Vencimientos y deudas del Dashboard, además de conservar «Ver todos los pendientes» y el acceso desde Cuotas y cobros. La ruta ahora muestra el título completo.

Los filtros propios del centro estaban en el componente y se perdían al recrearlo, por ejemplo durante una comprobación de permisos. Ahora viven en el servicio financiero, separados de los filtros de Cuotas y cobros. Se limpian al cambiar la sesión, sin modificar autenticación.

Al entrar se solicita un refresco si los datos tienen más de 60 segundos o aún no están cargados. No hay polling ni consultas superpuestas al recrear la vista. Tras un error se esperan 30 segundos para un refresco de entrada; Actualizar permite reintentar inmediatamente. Registrar, editar o eliminar un pago mantiene el mecanismo existente: confirmar la escritura y releer el snapshot de Supabase antes de publicar los nuevos saldos.

El centro siempre utiliza todas las cuentas del servicio, sin aplicar el período del listado o del Dashboard. El total general suma saldos en centavos una sola vez y no cambia al buscar o elegir categoría. Las categorías son excluyentes: vencidas, próximas (hoy a 7 días), parciales posteriores y otros saldos. Las vencidas con abonos mantienen la indicación de pagos parciales. Dashboard y Centro reutilizan `clasificarPendientes` para seleccionar y ordenar deudas; no se crea otro cálculo de pagos o saldos.

La generación de cuotas disponible sigue siendo manual mediante RPC, con vista previa, confirmación y restricción de duplicados. El repositorio no contiene Cron ni pruebas de una tarea programada operativa. No se verificó un scheduler externo en Supabase, por lo que no se considera comprobada la generación automática y se conserva «Generar cuotas del mes». El alta con primera cuota es otra operación explícita al guardar el alumno, no una programación mensual.

Para verificar:

1. Ejecutar `npm test -- --watch=false` y `npm run build -- --configuration production`.
2. Abrir Dashboard y probar ambos accesos al centro, incluso con un mes sin cuotas. Deben incluirse deudas históricas.
3. Buscar por alumno/concepto y alternar categorías; revisar total general y marcas de abonos parciales.
4. Registrar un pago parcial y luego completo. Corregir/eliminar un pago desde Ver cuota y pagos y comprobar los saldos, categorías y filtros conservados.
5. Cambiar los filtros de Cuotas y cobros, volver al centro y verificar su independencia. Probar carga, error y Actualizar.
6. Revisar escritorio y celular: tarjetas sin scroll horizontal, textos largos, botones de al menos 44 px y categorías que se acomodan en varias líneas.

Las pruebas de integración usan el servicio real con repositorio simulado. La aceptación visual en navegador/celular y las operaciones contra un entorno remoto de prueba quedan para validación manual. No se ejecuta SQL, no se cambia RLS ni se agregan datos de negocio desde esta etapa.
