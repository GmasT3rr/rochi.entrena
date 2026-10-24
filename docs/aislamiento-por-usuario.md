> Actualizaci?n: ver `docs/preparar-copia-aislamiento.md`. 005 fue corregida y ejecutada en PostgreSQL embebido local; la copia Supabase y las sesiones Auth reales siguen pendientes.

# Aislamiento por usuario — propuesta 005

**Estado: preparado para revisión, NO instalado ni probado contra PostgreSQL/API. La base actual sigue compartida hasta aplicar 005 manualmente.** No se cambió registro público, usuarios, permisos administrativos remotos ni datos existentes. No hubo commit, push ni deploy.

## Diseño

Cada alumno, configuración mensual, cuota y pago incorpora `propietario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT`, con DEFAULT auth.uid(). Ser propietario no basta: también se requiere administrador activo. No se introduce empresa, membresía o rol administrativo global con acceso a datos de otros. Un administrador administra solo sus propias filas; postgres/service_role siguen siendo operadores privilegiados que omiten RLS y jamás deben llegar a Angular.

RLS exige dueño actual + administración para SELECT, INSERT y ambos lados de UPDATE (USING/WITH CHECK). Solo cuotas/pagos conservan DELETE con la misma condición; alumnos y configuraciones siguen sin borrado físico. Se retiran las políticas anteriores para evitar su combinación permisiva OR y se añade una política restrictiva de propietario. Un trigger impide cambiar propietario, incluso al modificar columnas por REST. Insertar explícitamente el UUID de otro usuario tampoco supera WITH CHECK.

Las FK compuestas unen `(propietario_id, alumno_id)` con el dueño/ID del alumno y `(propietario_id, cuota_id)` con el dueño/ID de la cuota. Impiden vínculos cruzados aunque se alteren IDs desde el navegador. Se reemplazan las FK simples conservando sus nombres para evitar relaciones duplicadas en PostgREST. Se conservan IDs, uniqueness de alumno/período/concepto, importes, fechas, pagos, revisiones y restricciones financieras existentes. Los IDs siguen siendo globalmente únicos: esta propuesta no cambia PK ni renumera datos legados.

Historial incorpora dueño separado de actor. El trigger privilegiado copia la propiedad de NEW/OLD y auth.uid() como autor; las lecturas solo permiten registros propios a administradores. Los clientes siguen sin escritura sobre historial o administradores, y el esquema privado debe permanecer fuera de Data API. El FK de propietario impide eliminar la cuenta Auth mientras conserve datos/historial: una futura baja definitiva requiere un procedimiento de retención explícito.

Referencias: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [restricciones de PostgreSQL](https://www.postgresql.org/docs/15/ddl-constraints.html).

## RPC revisadas

001, es_administrador_actual(): mantiene su función exclusivamente de autorización, sin propietario elegido por cliente.

005 reemplaza con las mismas firmas:

- guardar_alumno_con_configuracion(p_id,p_crear,p_datos): mantiene validación estricta de campos, transacción e invoker; el dueño de altas sale del DEFAULT, no del JSON. Editar un ID ajeno no encuentra fila autorizada. Configuración permanece asociada por FK compuesta y RLS.
- leer_cuentas_administrativas(): filtra explícitamente alumnos/cuotas/pagos por auth.uid(), además de RLS. Contrato JSON versión 1 conservado.
- previsualizar_cuotas_mensuales(): solo alumnos/configuraciones/cuotas del usuario. La huella incluye UUID, por lo que dos vistas vacías de usuarios distintos tampoco son intercambiables.
- generar_cuotas_mensuales(): advisory lock por usuario/período y bloqueos de filas propias en orden. Conserva comparación de huella, transacción del lote, restricciones únicas y omisión sin sobrescritura. Los usuarios distintos ya no bloquean intencionalmente todo el estudio; una improbable colisión hash solo serializa, no concede acceso.

Las RPC de negocio continúan SECURITY INVOKER, search_path vacío y ejecución solo authenticated. Los triggers de pago y reducción de importes no se modifican: siguen operando sobre la misma cuota y pagos, ahora protegidos por RLS y relaciones de propietario.

## Procedimiento de migración de existentes

1. Respaldar y ensayar restauración en proyecto aislado. Inventariar tablas, políticas, funciones y nombres de FK/triggers realmente instalados; el script presupone el esquema original y 001–004. Si difieren, revisar el SQL antes de ejecutarlo.
2. Como operador confiable, inventariar `alumnos` y `historial` (incluidos DELETE y filas sin registro actual). Revisar el contenido de anterior/nuevo para determinar a quién pertenece cada evento. El actor histórico no demuestra propiedad: todos los administradores compartían datos. Ante duda, resolver la asignación con las personas responsables; no elegir al primer administrador ni al usuario conectado.
3. Completar **en una copia local privada** los dos JSON vacíos al inicio de `docs/database/005-aislamiento-por-usuario.sql`:

   ```json
   [{"alumno_id":"ID_EXISTENTE","propietario_id":"UUID_AUTH_CORRECTO"}]
   ```

   ```json
   [{"historial_id":123,"propietario_id":"UUID_AUTH_CORRECTO"}]
   ```

   Una entrada por alumno y una por cada fila histórica. No subir mapas reales al repositorio. Las configuraciones, cuotas y pagos actuales heredan al dueño del alumno mediante las relaciones existentes; nunca se divide una cadena financiera entre propietarios. La revisión histórica es explícita, incluso cuando existe una fila con el mismo ID: los IDs borrados pudieron reutilizarse.
4. Verificar que los UUID existen en Auth. No es necesario que estén activos durante el backfill: eso no los habilita como administradores. La lista administrativa no se modifica. Sin dueño de algún alumno/historial, el script aborta. En una base completamente vacía ambos mapas pueden quedar vacíos.
5. Acordar ventana de mantenimiento y cerrar sesiones/pestañas de la app. Ejecutar manualmente 005 como postgres: es una transacción con bloqueo exclusivo y timeout de adquisición de 10 segundos. No hay una fase intermedia publicada con propietarios nulos. Si falla, ROLLBACK y revisar; no continuar trozos ni repetir a ciegas. Las migraciones 001–004 no se vuelven a ejecutar.
6. Durante el backfill se deshabilitan SOLO auditar/marcar_actualizacion dentro de la transacción para no generar historia falsa ni alterar timestamps. Los triggers financieros permanecen activos. Al completar se reactivan; un rollback restaura también su estado previo. Se valida NOT NULL y las FK antes del commit. No se elimina ninguna fila.
7. Verificar conteos, IDs, importes, fechas, revisiones y timestamps contra el respaldo; verificar activación de triggers y políticas; revisar historial por propietario. Cerrar/reabrir sesiones o recargar completamente todos los clientes antes de volver a habilitar uso: ninguna migración puede retirar datos que una sesión anterior ya descargó en memoria.

Si un alumno histórico era compartido realmente entre dos administradores, esta migración no lo duplica: hay que decidir su único propietario antes. Transferencias de propiedad posteriores quedan bloqueadas y requieren otro procedimiento revisado.

## Angular y DEMO

No se envía ni se agrega propietario editable a los modelos de negocio. Los repositorios existentes usan sesión real; el servidor decide propiedad. Se hizo explícita la relación de configuración en alumnos-supabase-repository.ts usando el nombre de FK conservado, para que el embed no dependa de inferencias ambiguas. El mapper ya admite objeto o array de configuración.

Dashboard, CuentasService, generación mensual y componentes mantienen sus cálculos/contratos. Su snapshot ahora estará filtrado en el servidor. Los servicios existentes limpian datos y descartan respuestas ante cambios de sesión; no se agrega caché financiera local. Hay que probar el embed con la nueva FK real antes de publicar.

No se encontró un generador llamado DEMO. Se adaptó el generador disponible `docs/database/fixtures-api-rls.sql`: exige UUID explícito existente y administrador activo, configura identidad local a la transacción y cambia a authenticated; los inserts pasan por RLS y asignan ese UUID a las cuatro tablas. Vacío/incorrecto aborta antes de insertar. Solo ejecución manual y proyecto de pruebas, nunca en el inicio de Angular. La configuración demo nace deshabilitada; habilitarla expresamente si se quiere ensayar generación mensual.

## Pruebas preparadas y pendientes

Crear manualmente dos cuentas de prueba en Supabase Dashboard → Authentication → Users, sin habilitar signup. Un operador agrega sus UUID a la tabla privada de administradores siguiendo el procedimiento existente. No compartir contraseñas/JWT por chat. Ejecutar el fixture una vez por usuario, indicando su UUID y guardando los dos IDs mostrados.

Después de instalar 005 en proyecto de pruebas:

```powershell
node scripts/verificar-aislamiento.mjs --confirmar-proyecto-pruebas
```

Pide correos y contraseñas ocultas localmente y usa solo publishable key y JWT reales. Primero demuestra que A ve su fixture y B el suyo; luego prueba en ambas direcciones lecturas, PATCH y DELETE ajenos, propietario falsificado/inmutable, vínculos financieros cruzados, RPC de guardado/lectura/vista mensual y rechazo de huella de otro usuario. Relee con ambos dueños para verificar que las filas no cambiaron. Se detiene al primer fallo, no imprime credenciales ni respuestas. **Puede mutar fixtures si RLS es defectuoso**: se exige opt-in y solo admite datos de prueba marcados. No se debe apuntar al proyecto operativo.

Complementar con `docs/database/prueba-aislamiento-usuarios.sql`, completando ambos UUID y un período con candidatos reales de prueba. Usa role authenticated con identidad de cada usuario, verifica historial privado con controles positivos, acceso negado a administradores y generación propia; termina ROLLBACK. No sustituye los controles HTTP. Para generación exitosa por API, confirmar desde dos navegadores administrativos en el mismo período y comparar cuotas/historial propios y ajenos antes/después. Probar además mismo usuario/dos sesiones concurrentes, pagos parciales/sobrepago, reducir cuota bajo lo abonado, duplicados y borrar cuota con pagos: las reglas previas deben seguir intactas.

Pruebas locales ejecutadas: 185 tests Angular aprobados, build de producción correcto (advertencia existente de bundle), 3 tests estáticos de estructura 005 y chequeo sintáctico Node del verificador. **No se ejecutó PostgreSQL, DEMO ni verificador HTTP. Los tests estáticos no validan la sintaxis SQL ni demuestran aislamiento real.** Falta ejecutar todos los recorridos contra la migración instalada y registrar resultados antes de producción.
