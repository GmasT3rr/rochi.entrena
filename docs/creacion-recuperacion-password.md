# Creación y recuperación de contraseña

## Comportamiento implementado

- Login conserva acceso por contraseña e incorpora la solicitud de recuperación con resetPasswordForEmail. El mensaje de solicitud es genérico para no revelar si un correo existe. Nunca se llama a signUp ni a APIs administrativas.
- La ruta pública #/nueva-contrasena muestra invitación o recuperación, dos campos de contraseña, confirmación, visibilidad opcional y la política existente: 12–128 caracteres, mayúscula, minúscula, número y símbolo. La misma política sigue usándose en Configuración.
- Antes de mostrar los campos y nuevamente antes de actualizar, se exige un contexto de invitación/recuperación, sesión coincidente y getUser verificado por el servidor. Una sesión ordinaria, abrir la ruta manualmente o enviar solamente type=invite no habilita el cambio. Los guards de administración y repositorios continúan bloqueando el acceso durante el flujo.
- El único payload de actualización es updateUser({ password }). No se cambian UUID, email, metadatos, autorizaciones, RLS, datos de negocio ni migraciones.
- Tras confirmar el cambio se muestra Toast de éxito, se limpian los campos y se cierra únicamente la sesión local. Si falla ese cierre, la pantalla conserva el éxito del guardado y ofrece reintentar el cierre sin volver a enviar la contraseña.
- Los enlaces vencidos, usados, de otra identidad o PKCE sin verifier conducen a una pantalla recuperable con Solicitar otro enlace. Los errores internos no se muestran. Los botones se bloquean durante las operaciones.

## Supabase y hash routing

El SDK procesa la sesión antes de bootstrapApplication y antes del router Angular. Se aceptan callbacks implícitos de tipo invite/recovery, callbacks PKCE con code y sb_flow_id, y plantillas opcionales con token_hash y type=invite/recovery mediante verifyOtp. Se normalizan también callbacks que llegaron detrás de #/login o #/nueva-contrasena. No se implementa un intercambio manual de access/refresh tokens.

El redirectTo de recuperación se deriva de document.baseURI y vuelve a la raíz de la aplicación, sin hash ni query: en Pages es https://gmast3rr.github.io/rochi.entrena/ y en desarrollo http://localhost:4200/. Una vez procesado el enlace, la app elimina sus parámetros sensibles y coloca #/nueva-contrasena. Conserva withHashLocation y la base /rochi.entrena/; no necesita rutas físicas ni un servidor adicional.

El marcador de interfaz vive en sessionStorage, identifica usuario/tipo y vence a los 60 minutos. No contiene tokens ni contraseñas y no reemplaza la validación de Auth. Permite recargar en la misma pestaña. Se invalida ante cambio de identidad/cierre, sesión no válida o expiración; marcadores antiguos o corruptos exigen un enlace nuevo. Con sessionStorage bloqueado el flujo funciona en memoria, pero puede requerir otro enlace después de recargar.

No se modificó la configuración remota. Antes de probar, el operador debe comprobar en Supabase → Authentication → URL Configuration que la raíz usada esté permitida en Redirect URLs. Para pruebas locales puede autorizar http://localhost:4200/**; mantener las URLs de producción lo más específicas posible. Con PKCE, el SDK instalado puede añadir sb_flow_id a la redirección. Si Supabase descarta la URL solicitada y vuelve al Site URL, revisar la lista permitida y la plantilla del correo. Las plantillas estándar deben conservar ConfirmationURL; no fijar una redirección al sitio publicado al probar la versión local.

El registro público debe seguir deshabilitado en el proyecto. Esta entrega no cambia ese ajuste ni crea cuentas.

## Probar con la usuaria ya invitada y confirmada

Después del despliegue, probar en https://gmast3rr.github.io/rochi.entrena/#/login con la raíz de Pages permitida en Supabase. Los pasos siguientes también sirven para la prueba local usando una URL local previamente permitida. No hace falta recrear a la usuaria.

1. Ejecutar npm start y abrir http://localhost:4200/#/login en un perfil/pestaña donde no esté iniciada otra cuenta. Usar exactamente el mismo origen durante todo el flujo; no alternar localhost con 127.0.0.1.
2. Pulsar ¿Olvidaste tu contraseña?, ingresar el correo que ya tiene la usuaria en Supabase y Enviar enlace. No borrar/recrear la usuaria ni volver a invitarla: la invitación anterior ya confirmada puede estar consumida. Este pedido funciona sobre su cuenta existente.
3. Abrir el correo más reciente en el mismo navegador/perfil donde se solicitó. En PKCE se necesita el verifier guardado por ese navegador. Revisar spam y no usar enlaces anteriores, ya consumidos o vencidos. No copiar tokens, contraseñas ni el enlace completo a chats o capturas.
4. Comprobar que el retorno llegue a localhost y termine en #/nueva-contrasena, sin tokens en la barra. Si se está probando localmente pero el enlace llega a Pages, revisar las URLs permitidas y la plantilla, y solicitar un enlace nuevo desde localhost. Para probar producción, iniciar la solicitud directamente desde Pages.
5. Ingresar una contraseña que cumpla los requisitos y repetirla. Guardar, esperar el mensaje confirmado y el retorno al login. Iniciar sesión con el mismo correo y la contraseña nueva. El acceso al panel sigue dependiendo de su autorización administrativa existente y de RLS; establecer contraseña no concede permisos.
6. Para una invitación aún no consumida, abrir su enlace dirigido a la raíz local: debe mostrar Creá tu contraseña. La usuaria ya confirmada del caso actual debe probar el camino de recuperación de los pasos anteriores.

La solicitud de correo y el guardado durante esta prueba manual sí son acciones reales de Auth sobre esa cuenta; realizarlas solo cuando la usuaria quiera establecer su contraseña. La implementación y las pruebas finales automatizadas usan el SDK simulado; no se ejecutó un cambio real de contraseña durante esta tarea.

## Casos adicionales

- Probar contraseñas débiles y confirmación distinta: no debe enviarse updateUser.
- Abrir #/nueva-contrasena sin enlace: no deben aparecer los campos habilitados.
- Reutilizar un enlace o abrir un PKCE en otro perfil: debe ofrecer pedir otro enlace y no habilitar una sesión previa para cambiar la contraseña.
- Recargar el formulario válido: debe validar nuevamente la misma identidad.
- Simular error de red: no debe anunciar guardado exitoso antes de la confirmación. Si solo falló el cierre de sesión posterior, debe conservar el éxito y ofrecer reintentar ese cierre.
- Luego de guardar/iniciar sesión, comprobar que la cuenta conserva su UUID y su acceso habitual; las comprobaciones de datos son manuales, no se ejecutaron consultas SQL aquí.

## Validación local

- 243 pruebas Angular aprobadas en 27 archivos, incluyendo callbacks simulados y prohibición de llamadas fetch en los tests de arranque.
- 6 pruebas de inicialización del tema aprobadas.
- Build de producción con --base-href /rochi.entrena/ aprobado. Mantiene el aviso de bundle inicial cercano a 901 kB frente al umbral orientativo de 500 kB, por debajo del límite de error de 1 MB.
- No se agregaron dependencias ni se cambiaron claves/configuración de Supabase. La publicación en main usa el workflow existente de GitHub Pages.
- Pendiente: validación manual del correo real, las URLs permitidas y las plantillas configuradas en ese proyecto. Los tests locales no acreditan la entrega de emails ni cambian sus ajustes.

## Referencias oficiales

- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)

También se revisó el código instalado de @supabase/auth-js para el consumo del callback y el evento PASSWORD_RECOVERY; no se modificó node_modules.
