-- REVISAR antes de ejecutar como postgres. Requiere 001..006 instaladas.
-- No activa Cron. No genera cuotas durante la migración.
begin;
set local lock_timeout = '10s';
alter table public.configuraciones_mensuales add column periodo_inicio date;
-- No inventar deuda retroactiva: comenzar como mínimo en el mes de instalación.
-- Revisar alumnos con inicio futuro conocido antes de activar Cron.
update public.configuraciones_mensuales c set periodo_inicio = greatest(
  date_trunc('month', timezone('America/Argentina/Buenos_Aires',clock_timestamp()))::date,
  date_trunc('month', a.fecha_ingreso::timestamp)::date,
  coalesce((select min(q.periodo) from public.cuotas q where q.alumno_id=a.id
    and q.propietario_id=a.propietario_id
    and q.concepto_clave=rochy_privado.normalizar_concepto('Cuota de entrenamiento')),
    date_trunc('month', timezone('America/Argentina/Buenos_Aires',clock_timestamp()))::date))
from public.alumnos a where a.id=c.alumno_id and a.propietario_id=c.propietario_id;
alter table public.configuraciones_mensuales alter column periodo_inicio set not null;
alter table public.configuraciones_mensuales alter column periodo_inicio set default
  date_trunc('month', timezone('America/Argentina/Buenos_Aires',clock_timestamp()))::date;
alter table public.configuraciones_mensuales add constraint configuracion_periodo_inicio_valido
  check (periodo_inicio between date '1900-01-01' and date '9999-12-01' and extract(day from periodo_inicio)=1);

create table rochy_privado.automatizacion_mensual (
  id boolean primary key default true check(id),
  habilitada boolean not null default false,
  activada_en timestamptz
);
insert into rochy_privado.automatizacion_mensual(id) values(true);
create table rochy_privado.ejecuciones_mensuales (
  id bigint generated always as identity primary key,
  iniciada_en timestamptz not null default clock_timestamp(),
  finalizada_en timestamptz,
  periodo date not null,
  origen text not null check(origen in ('cron','recuperacion')),
  resultado text not null check(resultado in ('iniciada','confirmada','error','deshabilitada')),
  creadas integer not null default 0 check(creadas>=0),
  omitidas integer not null default 0 check(omitidas>=0),
  errores integer not null default 0 check(errores>=0),
  codigo_error text,
  detalle_error text
);
alter table rochy_privado.automatizacion_mensual enable row level security;
alter table rochy_privado.ejecuciones_mensuales enable row level security;
revoke all on rochy_privado.automatizacion_mensual,rochy_privado.ejecuciones_mensuales from public,anon,authenticated;
revoke all on sequence rochy_privado.ejecuciones_mensuales_id_seq from public,anon,authenticated;

-- FUNCIONES DE CONFIGURACIÓN Y GENERACIÓN EXISTENTES, ACTUALIZADAS A CONTINUACIÓN.

create or replace function public.guardar_alumno_con_configuracion(p_id text, p_crear boolean, p_datos jsonb)
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
    if config - array['habilitada', 'importe', 'dia_vencimiento', 'periodo_inicio'] <> '{}'::jsonb
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
  if config ? 'periodo_inicio' then
    if jsonb_typeof(config->'periodo_inicio') is distinct from 'string'
      or (config->>'periodo_inicio') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      or substring(config->>'periodo_inicio',1,4)::integer not between 1900 and 9999 then
      raise exception 'Periodo de inicio invalido' using errcode='22023';
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
    where id = p_id and propietario_id = auth.uid() returning * into alumno;
    if not found then raise exception 'Alumno no disponible' using errcode = '42501'; end if;
  end if;
  if config is not null and config <> 'null'::jsonb then
    insert into public.configuraciones_mensuales(alumno_id, habilitada, importe, dia_vencimiento, periodo_inicio)
    values (p_id, (config->>'habilitada')::boolean, (config->>'importe')::public.importe_ars,
      (config->>'dia_vencimiento')::smallint,
      coalesce(((config->>'periodo_inicio') || '-01')::date,
        (select c.periodo_inicio from public.configuraciones_mensuales c where c.alumno_id=p_id and c.propietario_id=auth.uid()),
        greatest(date_trunc('month',timezone('America/Argentina/Buenos_Aires',clock_timestamp()))::date,date_trunc('month',fecha::timestamp)::date)))
    on conflict (alumno_id) do update set habilitada = excluded.habilitada,
      importe = excluded.importe, dia_vencimiento = excluded.dia_vencimiento, periodo_inicio = excluded.periodo_inicio;
  else
    -- Ausente/null: sin fila en un alta; en edición deshabilita sin perder valores.
    update public.configuraciones_mensuales set habilitada = false where alumno_id = p_id and propietario_id = auth.uid();
  end if;
  return to_jsonb(alumno) || jsonb_build_object('configuracion_mensual',
    (select to_jsonb(c) from public.configuraciones_mensuales c where c.alumno_id = p_id and c.propietario_id = auth.uid()));
end;
$$;
alter function public.guardar_alumno_con_configuracion(text, boolean, jsonb) owner to postgres;
revoke all on function public.guardar_alumno_con_configuracion(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_alumno_con_configuracion(text, boolean, jsonb) to authenticated;


create or replace function public.crear_alumno_con_primera_cuota(p_id text, p_datos jsonb, p_periodo text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare resultado jsonb; config public.configuraciones_mensuales;
  inicio date; ultimo_dia integer;
begin
  if auth.uid() is null or public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or substring(p_periodo,1,4)::integer not between 1900 and 9999 then
    raise exception 'Primer período inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object'
    or (p_datos->'configuracion_mensual'->'habilitada') is distinct from 'true'::jsonb then
    raise exception 'Se requiere cobro mensual habilitado' using errcode = '22023';
  end if;
  -- Siempre ALTA, nunca upsert: un ID repetido falla sin tocar al alumno existente.
  -- La llamada anidada participa en esta misma transacción PostgreSQL.
  resultado := public.guardar_alumno_con_configuracion(p_id, true,
    jsonb_set(p_datos, '{configuracion_mensual,periodo_inicio}', to_jsonb(p_periodo)));
  select c.* into strict config from public.configuraciones_mensuales c
    where c.alumno_id=p_id and c.propietario_id=auth.uid();
  inicio := (p_periodo || '-01')::date;
  ultimo_dia := extract(day from (inicio::timestamp + interval '1 month - 1 day'))::integer;
  -- El mismo concepto que la generación mensual: su UNIQUE evita duplicados.
  -- No capturar errores: cualquier fallo revierte alumno, configuración y auditoría.
  insert into public.cuotas(alumno_id, concepto, periodo, importe, vencimiento, observaciones)
  values (p_id, 'Cuota de entrenamiento', inicio, config.importe,
    inicio + (least(config.dia_vencimiento::integer, ultimo_dia) - 1), '');
  -- Sin pagos: el estado y saldo se derivan de los registros existentes.
  return resultado;
end $$;
alter function public.crear_alumno_con_primera_cuota(text,jsonb,text) owner to postgres;
revoke all on function public.crear_alumno_con_primera_cuota(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.crear_alumno_con_primera_cuota(text,jsonb,text) to authenticated;

create or replace function public.previsualizar_cuotas_mensuales(p_periodo text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare inicio date; ultimo_dia integer; vista jsonb;
begin
  if public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if substring(p_periodo, 1, 4)::integer not between 1900 and 9999 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  inicio := (p_periodo || '-01')::date;
  ultimo_dia := extract(day from (inicio::timestamp + interval '1 month - 1 day'))::integer;
  -- Una sola sentencia captura candidatos y omitidos sobre la misma instantánea.
  with base as (
    select a.id, a.nombre || ' ' || a.apellido as alumno, c.importe, c.dia_vencimiento,
      case when a.estado <> 'Activo' then 'Alumno inactivo o en pausa'
        when c.alumno_id is null then 'Sin configuración mensual'
        when not c.habilitada then 'Generación mensual deshabilitada'
        when c.periodo_inicio > inicio then 'Periodo de inicio futuro'
        when a.fecha_ingreso >= (inicio::timestamp + interval '1 month')::date then 'Ingreso posterior al periodo'
        when exists (select 1 from public.cuotas q where q.propietario_id = auth.uid() and q.alumno_id = a.id and q.periodo = inicio
          and q.concepto_clave = rochy_privado.normalizar_concepto('Cuota de entrenamiento'))
          then 'Ya existe la cuota del período'
        else null end as motivo
    from public.alumnos a left join public.configuraciones_mensuales c on c.alumno_id = a.id and c.propietario_id = a.propietario_id
    where a.propietario_id = auth.uid()
  )
  select jsonb_build_object('periodo', p_periodo,
    'cuotas', coalesce(jsonb_agg(jsonb_build_object(
      'alumnoId', id, 'alumno', alumno, 'concepto', 'Cuota de entrenamiento', 'periodo', p_periodo,
      'importe', importe, 'vencimiento', (inicio + (least(dia_vencimiento::integer, ultimo_dia) - 1))::text,
      'observaciones', '') order by id) filter (where motivo is null), '[]'::jsonb),
    'omitidos', coalesce(jsonb_agg(jsonb_build_object('alumnoId', id, 'alumno', alumno, 'motivo', motivo)
      order by id) filter (where motivo is not null), '[]'::jsonb)) into vista from base;
  -- Huella de cambio, no credencial ni autorización: importes siempre se releen en servidor.
  return vista || jsonb_build_object('huella', md5(auth.uid()::text || ':' || vista::text));
end;
$$;


alter function public.previsualizar_cuotas_mensuales(text) owner to postgres;
revoke all on function public.previsualizar_cuotas_mensuales(text) from public,anon,authenticated;
grant execute on function public.previsualizar_cuotas_mensuales(text) to authenticated;
notify pgrst, 'reload schema';
commit;
