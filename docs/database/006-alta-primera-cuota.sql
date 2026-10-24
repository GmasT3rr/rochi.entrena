-- SOLO REVISIÓN y ejecución MANUAL como postgres. No ejecutar desde Angular.
-- Requiere esquema y migraciones 001..005 revisadas e instaladas.
-- No cambia RLS, tablas, pagos, generación mensual ni funciones existentes.
begin;
set local lock_timeout = '10s';
do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='alumnos' and column_name='propietario_id') then
    raise exception 'Requiere aislamiento por usuario (005) previamente revisado e instalado';
  end if;
end $$;

create function public.crear_alumno_con_primera_cuota(p_id text, p_datos jsonb, p_periodo text)
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
  resultado := public.guardar_alumno_con_configuracion(p_id, true, p_datos);
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
notify pgrst, 'reload schema';
commit;
