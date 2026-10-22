-- PRUEBA MANUAL, NO EJECUTADA. SQL Editor como postgres, proyecto de pruebas.
-- Requiere migración 002 y UUID de administrador activo ya existente.
-- Simula claims/rol para verificar atomicidad; no sustituye pruebas HTTP reales.
begin;
select set_config('test.admin_id', 'REEMPLAZAR_UUID_ADMIN_ACTIVO', true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin_id'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare id_prueba text := 'prueba-alumno-' || gen_random_uuid()::text;
  datos jsonb; resultado jsonb; fallo boolean := false;
begin
  datos := jsonb_build_object('nombre', 'Prueba', 'apellido', 'Transacción',
    'telefono', '', 'email', '', 'modalidad', 'Online', 'estado', 'Activo',
    'fecha_ingreso', current_date::text, 'observaciones', '',
    'configuracion_mensual', jsonb_build_object('habilitada', true, 'importe', -1, 'dia_vencimiento', 15));
  begin
    perform public.guardar_alumno_con_configuracion(id_prueba, true, datos);
  exception when check_violation then fallo := true;
  end;
  if not fallo then raise exception 'Se aceptó configuración inválida'; end if;
  if exists(select 1 from public.alumnos where id = id_prueba)
    or exists(select 1 from public.configuraciones_mensuales where alumno_id = id_prueba) then
    raise exception 'Guardado parcial';
  end if;
  datos := jsonb_set(datos, '{configuracion_mensual,importe}', '10000'::jsonb);
  resultado := public.guardar_alumno_con_configuracion(id_prueba, true, datos);
  if resultado->>'id' <> id_prueba or resultado#>>'{configuracion_mensual,habilitada}' <> 'true' then
    raise exception 'Alta incorrecta';
  end if;
  datos := jsonb_set(datos, '{nombre}', '"Editada"'::jsonb);
  datos := jsonb_set(datos, '{configuracion_mensual,habilitada}', 'false'::jsonb);
  resultado := public.guardar_alumno_con_configuracion(id_prueba, false, datos);
  if resultado->>'nombre' <> 'Editada' or resultado#>>'{configuracion_mensual,habilitada}' <> 'false'
    or (resultado#>>'{configuracion_mensual,importe}')::numeric <> 10000 then
    raise exception 'Edición o deshabilitación incorrectas';
  end if;
  -- Configuración ausente en el payload tampoco elimina la fila previa.
  resultado := public.guardar_alumno_con_configuracion(id_prueba, false, datos - 'configuracion_mensual');
  if (resultado#>>'{configuracion_mensual,importe}')::numeric <> 10000 then
    raise exception 'Se perdió la configuración anterior';
  end if;
  update public.alumnos set estado = 'Inactivo' where id = id_prueba;
  if not exists(select 1 from public.alumnos where id = id_prueba and estado = 'Inactivo') then
    raise exception 'Baja lógica incorrecta';
  end if;
end;
$$;
reset role;
rollback;
-- Ante cualquier error: ejecutar ROLLBACK antes de corregir/reintentar.
