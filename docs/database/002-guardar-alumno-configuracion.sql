-- Incremental para revisión y ejecución MANUAL como postgres. No modifica tablas ni RLS.
-- Requiere 001 y las tablas existentes. Instalar una sola vez.
begin;
create function public.guardar_alumno_con_configuracion(p_id text, p_crear boolean, p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare alumno public.alumnos; config jsonb; campo text; fecha date;
begin
  if public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  if p_id is null or btrim(p_id) = '' or p_crear is null
    or jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'Datos inválidos' using errcode = '22023';
  end if;
  -- Contrato del payload Angular: nombres PostgreSQL, sin campos técnicos.
  if p_datos - array['nombre', 'apellido', 'telefono', 'email', 'modalidad', 'estado',
      'fecha_ingreso', 'observaciones', 'configuracion_mensual'] <> '{}'::jsonb then
    raise exception 'Campos de alumno no reconocidos' using errcode = '22023';
  end if;
  foreach campo in array array['nombre', 'apellido', 'modalidad', 'estado', 'fecha_ingreso'] loop
    if jsonb_typeof(p_datos->campo) is distinct from 'string' then
      raise exception 'El campo % es obligatorio y debe ser texto', campo using errcode = '22023';
    end if;
  end loop;
  foreach campo in array array['telefono', 'email', 'observaciones'] loop
    if p_datos ? campo and jsonb_typeof(p_datos->campo) not in ('string', 'null') then
      raise exception 'El campo opcional % debe ser texto o null', campo using errcode = '22023';
    end if;
  end loop;
  -- Solo fecha ISO, sin timestamp ni interpretación dependiente de DateStyle.
  -- El cast rechaza días inexistentes; la tabla mantiene su rango 1900..9999.
  if (p_datos->>'fecha_ingreso') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'fecha_ingreso debe tener formato YYYY-MM-DD' using errcode = '22023';
  end if;
  fecha := (p_datos->>'fecha_ingreso')::date;
  config := p_datos->'configuracion_mensual';
  if config is not null and config <> 'null'::jsonb then
    if jsonb_typeof(config) <> 'object' then
      raise exception 'Configuración inválida' using errcode = '22023';
    end if;
    if config - array['habilitada', 'importe', 'dia_vencimiento'] <> '{}'::jsonb
      or jsonb_typeof(config->'habilitada') is distinct from 'boolean'
      or jsonb_typeof(config->'importe') is distinct from 'number'
      or jsonb_typeof(config->'dia_vencimiento') is distinct from 'number' then
      raise exception 'La configuración requiere habilitada, importe y dia_vencimiento válidos'
        using errcode = '22023';
    end if;
    -- También deshabilitada debe conservar importe y día válidos.
    -- Validar antes del cast a smallint para impedir redondeo de días fraccionarios.
    if (config->>'dia_vencimiento')::numeric <> trunc((config->>'dia_vencimiento')::numeric)
      or (config->>'dia_vencimiento')::numeric not between 1 and 31 then
      raise exception 'dia_vencimiento debe ser un entero del 1 al 31' using errcode = '22023';
    end if;
  end if;
  if p_crear then
    insert into public.alumnos(id, nombre, apellido, telefono, email, modalidad, estado, fecha_ingreso, observaciones)
    values (p_id, p_datos->>'nombre', p_datos->>'apellido', coalesce(p_datos->>'telefono', ''), coalesce(p_datos->>'email', ''),
      p_datos->>'modalidad', p_datos->>'estado', fecha, coalesce(p_datos->>'observaciones', ''))
    returning * into alumno;
  else
    update public.alumnos set nombre = p_datos->>'nombre', apellido = p_datos->>'apellido',
      telefono = coalesce(p_datos->>'telefono', ''), email = coalesce(p_datos->>'email', ''), modalidad = p_datos->>'modalidad',
      estado = p_datos->>'estado', fecha_ingreso = fecha,
      observaciones = coalesce(p_datos->>'observaciones', '')
    where id = p_id returning * into alumno;
    if not found then raise exception 'Alumno no disponible' using errcode = '42501'; end if;
  end if;
  if config is not null and config <> 'null'::jsonb then
    insert into public.configuraciones_mensuales(alumno_id, habilitada, importe, dia_vencimiento)
    values (p_id, (config->>'habilitada')::boolean, (config->>'importe')::public.importe_ars,
      (config->>'dia_vencimiento')::smallint)
    on conflict (alumno_id) do update set habilitada = excluded.habilitada,
      importe = excluded.importe, dia_vencimiento = excluded.dia_vencimiento;
  else
    -- Ausente/null: sin fila en un alta; en edición deshabilita sin perder valores.
    update public.configuraciones_mensuales set habilitada = false where alumno_id = p_id;
  end if;
  return to_jsonb(alumno) || jsonb_build_object('configuracion_mensual',
    (select to_jsonb(c) from public.configuraciones_mensuales c where c.alumno_id = p_id));
end;
$$;
alter function public.guardar_alumno_con_configuracion(text, boolean, jsonb) owner to postgres;
revoke all on function public.guardar_alumno_con_configuracion(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_alumno_con_configuracion(text, boolean, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
