# Dashboard, seguridad de cuenta y apariencia

## Dashboard

Antes no mostraba datos porque su componente estaba reducido deliberadamente a un mensaje de migración pendiente. No tenía repositorio ni consulta que fallara. Ahora consume `ResumenDashboard`, que reutiliza el snapshot y los estados calculados de `CuentasService` / `leer_cuentas_administrativas()`. No se agregó SQL ni se cambió ninguna fórmula, trigger o política financiera.

Los alumnos activos y sus modalidades representan su estado **actual**, no un historial por mes. Los indicadores financieros tienen selector de período:

- Cobrado: suma en centavos de pagos cuya fecha corresponde al mes elegido, incluso si la cuota pertenece a otro mes. Las cuotas emitidas no se cuentan como ingresos.
- Pendiente: suma de los saldos calculados por Cuentas para cuotas del período seleccionado.
- Vencidas y pagadas: utiliza los estados del servicio financiero existente.
- Con pagos parciales: cuotas con abonado > 0 y saldo > 0, incluidas las vencidas que tengan abonos. Puede superponerse con el contador de vencidas; la etiqueta lo explica.
- Vencimientos y deudas: hasta ocho cuotas pendientes del período, ordenadas por fecha. El detalle completo permanece en Cuentas y pagos.

No utiliza el archivo financiero local. Carga/error/vacío se muestran por separado; mientras se consulta o si falla la lectura no se renderizan indicadores en cero como si fueran datos válidos. “Actualizar” relee el snapshot existente; no hay Realtime. La selección del período se conserva en un servicio de presentación durante las comprobaciones de acceso.

## Cambio de contraseña

La versión instalada de `@supabase/supabase-js` es 2.118.0. Se revisaron los tipos y la implementación local de auth-js: el atributo admitido es **`current_password`**, junto a `password` y opcionalmente `nonce`.

`SeguridadCuenta` valida sesión y autorización administrativa con la RPC existente y obtiene el usuario mediante Auth. Comprueba la contraseña actual con un cliente Auth temporal aislado (`persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false` y clave de almacenamiento única). Solo continúa si la identidad coincide con la cuenta actual. Esto evita depender de que el proyecto tenga activada la exigencia de contraseña actual: en el servidor ese campo puede ser obligatorio según su configuración. La actualización se hace en el cliente de la sesión original con `updateUser({password, current_password, nonce?})`.

La sesión temporal se cierra con scope local en finally. No se reemplaza la sesión principal en el cliente ni se almacenan contraseñas en archivos, Signals de servicios, localStorage, logs o tablas propias. Las contraseñas se mantienen únicamente en los controles/argumentos en memoria y se limpian tras cada intento enviado y al destruir la pantalla. El navegador puede ofrecer su propio gestor de contraseñas mediante autocomplete estándar.

Si Auth exige reautenticación, se ofrece enviar un código mediante `reauthenticate()` y pasarlo como nonce al siguiente intento. No se cambian políticas del proyecto. La sesión temporal añade un inicio de sesión real: consume límites de Auth y está sujeta a sus restricciones de sesiones. Si hay una política de sesión única, podría invalidar la sesión anterior en el servidor; se debe probar esta combinación y volver a iniciar sesión cuando Auth lo exija. No se debilita ninguna política para evitar esos rechazos. Si la limpieza temporal falla por red, no persiste en este navegador pero su sesión remota queda sujeta a expiración/revocación del servidor.

La UI exige entre 12 y 128 caracteres con mayúscula, minúscula, número y símbolo; también confirmación igual y contraseña diferente de la actual. Los requisitos adicionales de Auth siguen siendo obligatorios. Permite mostrar/ocultar los tres campos. Bloquea solicitudes duplicadas y anuncia cambio exitoso únicamente después de respuesta satisfactoria. Los errores se traducen sin imprimir sus cuerpos internos. No se usaron claves privadas ni se modificó el flujo de recuperación existente.

Referencias: [contraseñas de Supabase](https://supabase.com/docs/guides/auth/passwords), [seguridad y reautenticación](https://supabase.com/docs/guides/auth/password-security). Se priorizó el contrato del SDK instalado ante ejemplos de otras versiones.

## Tema de toda la aplicación

Configuración ofrece Claro, Oscuro y Automático. Solo esta preferencia se guarda bajo `tuscuentasfacil.apariencia.v1`; no se alteran claves de datos ni sesiones. Si guardar está bloqueado, el tema se aplica en memoria y se avisa que no pudo conservarse para la próxima visita.

`public/theme-init.js` se carga en el head antes de la aplicación y aplica la preferencia antes del primer render. Es un recurso relativo al base href existente, compatible con Pages. `AparienciaService` mantiene el atributo del documento, sigue cambios del sistema en modo Automático y cambios de preferencia entre pestañas. El valor del almacenamiento se valida y no se inserta como HTML o CSS arbitrario.

Angular Material usa su tema color-scheme (light-dark), junto con variables de la paleta de TusCuentasFacil para superficies, texto, bordes, navegación, tarjetas y errores. El tema se aplica al documento completo, por lo que los overlays/diálogos/menús también lo heredan. Se adaptaron badges y colores de error para contraste oscuro. No se incluyó ninguna biblioteca nueva.

Configuración queda organizada en Apariencia, Seguridad de la cuenta y Sesión. No presenta tarjetas informativas simulando controles ni exportaciones antiguas como respaldo de los datos actuales. Los servicios del archivo anterior se mantienen sin cambios y no se inyectan en esta pantalla.

## Pruebas y verificación manual

Validación ejecutada: **158 tests aprobados en 15 archivos**, más **6 pruebas del script de inicio del tema**. Build de producción correcto con el base href existente `/rochi.entrena/`, incluyendo el recurso `theme-init.js`. Continúa la advertencia del bundle inicial: 787,55 kB frente al presupuesto orientativo de 500 kB. `git diff --check` sin errores.

Las pruebas locales usan clientes y respuestas simuladas; no cambiaron contraseñas reales, ajustes remotos, datos financieros ni SQL. Cubren sumas y períodos con pagos parciales, pagos de otras cuotas, estados, carga/vacío/error; fuerza y coincidencia de contraseñas, contraseña actual errónea, autorización, reautenticación, espera/duplicados y limpieza temporal; elección/persistencia/recarga de tema, sistema y almacenamiento bloqueado. Un test Node separado ejecuta el script real de tema en contexto aislado antes de simular el arranque.

Antes de considerar completada la validación visual y remota:

1. Dashboard: comparar un mes con la lista real de pagos por fecha, incluyendo un abono parcial y un pago de cuota de otro período. Comparar pendientes/vencidas con los filtros del mismo período en Cuentas. Probar un mes sin movimientos y una cuenta/base de pruebas sin datos. Bloquear la RPC de lectura y actualizar: no deben aparecer importes inventados.
2. Seguridad: con una cuenta administrativa de pruebas, intentar una contraseña actual incorrecta y una confirmación distinta. Después cambiar con datos válidos, comprobar éxito y probar el nuevo acceso; la anterior debe fallar. Si el proyecto pide código, enviarlo y probar nonce válido/vencido. Revisar el comportamiento bajo las restricciones de sesiones configuradas y con un corte de red. No copiar contraseñas, headers ni tokens al chat, terminal o capturas.
3. Apariencia: alternar Claro/Oscuro, recargar y comprobar conservación. Seleccionar Automático y cambiar el tema del sistema. Revisar login, sidebar, Dashboard, alumnos, tablas, formularios, selectores, detalle de cuota, formulario de pago y diálogo mensual. Verificar legibilidad de estados y errores, foco del teclado y tamaños de móvil/escritorio. Esta inspección visual en un navegador real no se ejecutó desde esta sesión; la compilación CSS y las pruebas de atributos no la sustituyen.

No hubo commit, push ni deploy. Sin migraciones nuevas; no se tocaron tablas, triggers, RLS, lógica financiera ni generación mensual. MFA/aal2 y respaldo remoto continúan pendientes fuera de esta etapa.
