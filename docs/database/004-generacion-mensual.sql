-- REVISIÓN Y EJECUCIÓN MANUAL como postgres. No modifica tablas, RLS ni históricos.
-- Requiere esquema existente y public.es_administrador_actual(). Instalar una vez.
begin;
create function public.previsualizar_cuotas_mensuales(p_periodo text)
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
        when exists (select 1 from public.cuotas q where q.alumno_id = a.id and q.periodo = inicio
          and q.concepto_clave = rochy_privado.normalizar_concepto('Cuota de entrenamiento'))
          then 'Ya existe la cuota del período'
        else null end as motivo
    from public.alumnos a left join public.configuraciones_mensuales c on c.alumno_id = a.id
  )
  select jsonb_build_object('periodo', p_periodo,
    'cuotas', coalesce(jsonb_agg(jsonb_build_object(
      'alumnoId', id, 'alumno', alumno, 'concepto', 'Cuota de entrenamiento', 'periodo', p_periodo,
      'importe', importe, 'vencimiento', (inicio + (least(dia_vencimiento::integer, ultimo_dia) - 1))::text,
      'observaciones', '') order by id) filter (where motivo is null), '[]'::jsonb),
    'omitidos', coalesce(jsonb_agg(jsonb_build_object('alumnoId', id, 'alumno', alumno, 'motivo', motivo)
      order by id) filter (where motivo is not null), '[]'::jsonb)) into vista from base;
  -- Huella de cambio, no credencial ni autorización: importes siempre se releen en servidor.
  return vista || jsonb_build_object('huella', md5(vista::text));
end;
$$;

create function public.generar_cuotas_mensuales(p_periodo text, p_huella text)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare vista jsonb; item jsonb; generadas integer := 0; omitidos jsonb;
  filas integer; fallidas integer := 0; estado text := 'confirmada';
begin
  if public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  -- Validar antes de calcular la clave del bloqueo o tocar datos.
  perform public.previsualizar_cuotas_mensuales(p_periodo);
  if p_huella is null or p_huella !~ '^[0-9a-f]{32}$' then
    raise exception 'Huella inválida' using errcode = '22023';
  end if;
  -- Mismo mes: una sola generación en curso; bloqueo liberado al terminar transacción.
  perform pg_catalog.pg_advisory_xact_lock(174338,
    substring(p_periodo, 1, 4)::integer * 12 + substring(p_periodo, 6, 2)::integer);
  -- Orden consistente con el guardado alumno/configuración de la RPC 002.
  -- Impide cambiar candidatos existentes mientras se valida y ejecuta el lote.
  perform a.id from public.alumnos a order by a.id for update;
  perform c.alumno_id from public.configuraciones_mensuales c order by c.alumno_id for update;
  vista := public.previsualizar_cuotas_mensuales(p_periodo);
  if vista->>'huella' is distinct from p_huella then
    raise exception 'VISTA_MENSUAL_DESACTUALIZADA' using errcode = 'P0001';
  end if;
  omitidos := vista->'omitidos';
  -- Subtransacción del lote: cualquier fallo controlado revierte TODAS sus inserciones.
  begin
    for item in select value from jsonb_array_elements(vista->'cuotas') loop
      insert into public.cuotas(alumno_id, concepto, periodo, importe, vencimiento, observaciones)
      values (item->>'alumnoId', item->>'concepto', (p_periodo || '-01')::date,
        (item->>'importe')::public.importe_ars, (item->>'vencimiento')::date, '')
      on conflict on constraint cuotas_alumno_periodo_concepto_unique do nothing;
      get diagnostics filas = row_count;
      if filas = 1 then generadas := generadas + 1;
      else omitidos := omitidos || jsonb_build_array(jsonb_build_object(
        'alumnoId', item->>'alumnoId', 'alumno', item->>'alumno', 'motivo', 'Cuota creada concurrentemente'));
      end if;
    end loop;
  exception when check_violation or not_null_violation or foreign_key_violation or raise_exception then
    estado := 'revertida';
    generadas := 0;
    -- Las omisiones por conflictos ya detectados pertenecen a otras transacciones
    -- y se conservan. El resto de candidatas falla por reversión de este lote.
    fallidas := jsonb_array_length(vista->'cuotas')
      - (jsonb_array_length(omitidos) - jsonb_array_length(vista->'omitidos'));
  end;
  -- Errores de autorización, serialización, deadlock/red no se ocultan como éxito.
  return jsonb_build_object('periodo', p_periodo, 'estado', estado, 'generadas', generadas,
    'omitidas', jsonb_array_length(omitidos), 'fallidas', fallidas, 'detalleOmitidos', omitidos);
end;
$$;
alter function public.previsualizar_cuotas_mensuales(text) owner to postgres;
alter function public.generar_cuotas_mensuales(text, text) owner to postgres;
revoke all on function public.previsualizar_cuotas_mensuales(text) from public, anon, authenticated;
revoke all on function public.generar_cuotas_mensuales(text, text) from public, anon, authenticated;
grant execute on function public.previsualizar_cuotas_mensuales(text) to authenticated;
grant execute on function public.generar_cuotas_mensuales(text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
