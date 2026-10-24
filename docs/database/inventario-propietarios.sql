-- INVENTARIO SOLO LECTURA. Ejecutar como operador confiable; no expone credenciales.
-- Exportar la única celda JSON a inventario.private.json, FUERA del repositorio público.
-- Incluye información personal: mantener privada y revisar en equipo autorizado.
begin isolation level repeatable read read only;
select jsonb_build_object(
 'version',1,
 'generado_en',clock_timestamp(),
 'usuarios',coalesce((select jsonb_agg(jsonb_build_object('usuario_id',u.id,'email',u.email,
   'administrador_activo',coalesce(a.activo,false)) order by u.id)
   from auth.users u left join rochy_privado.administradores a on a.usuario_id=u.id),'[]'::jsonb),
 'alumnos',coalesce((select jsonb_agg(jsonb_build_object('alumno_id',a.id,'nombre',a.nombre,'apellido',a.apellido,
   'email',a.email,'estado',a.estado,'propietario_id',null,
   'cuotas',(select count(*) from public.cuotas c where c.alumno_id=a.id),
   'pagos',(select count(*) from public.pagos p join public.cuotas c on c.id=p.cuota_id where c.alumno_id=a.id)) order by a.id)
   from public.alumnos a),'[]'::jsonb),
 'historial',coalesce((select jsonb_agg(jsonb_build_object('historial_id',h.id::text,'tabla',h.tabla,
   'registro_id',h.registro_id,'operacion',h.operacion,'ocurrido_en',h.ocurrido_en,'actor_id',h.actor_id,
   'anterior',h.anterior,'nuevo',h.nuevo,'propietario_id',null) order by h.id) from rochy_privado.historial h),'[]'::jsonb),
 'conteos',jsonb_build_object('alumnos',(select count(*) from public.alumnos),
   'configuraciones',(select count(*) from public.configuraciones_mensuales),
   'cuotas',(select count(*) from public.cuotas),'pagos',(select count(*) from public.pagos),
   'historial',(select count(*) from rochy_privado.historial))
) as inventario;
commit;
