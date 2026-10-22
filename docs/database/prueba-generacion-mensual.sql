-- PRUEBA MANUAL, NO EJECUTADA. Proyecto de pruebas con alumnos/configuraciones existentes.
-- No crea alumnos ni configura importes ficticios. Todo lo generado se revierte al final.
-- Requiere 004 y UUID de administrador activo. No sustituye pruebas con JWT reales.
begin;
select set_config('test.admin_id', 'REEMPLAZAR_UUID_ADMIN_ACTIVO', true);
select set_config('test.periodo', '2028-02', true); -- Elegir explícitamente un mes de prueba.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin_id'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare vista jsonb; actual jsonb; resultado jsonb; item jsonb;
  ids text[]; historicas jsonb; despues jsonb; config public.configuraciones_mensuales;
  inicio date; ultimo integer; esperadas integer; desactualizada boolean := false;
begin
  if public.es_administrador_actual() is distinct from true then raise exception 'Se requiere admin activo'; end if;
  inicio := (current_setting('test.periodo') || '-01')::date;
  ultimo := extract(day from (inicio::timestamp + interval '1 month - 1 day'))::integer;
  select coalesce(array_agg(id), array[]::text[]), coalesce(jsonb_agg(to_jsonb(c) order by id), '[]'::jsonb)
    into ids, historicas from public.cuotas c;
  vista := public.previsualizar_cuotas_mensuales(current_setting('test.periodo'));
  esperadas := jsonb_array_length(vista->'cuotas');
  for item in select value from jsonb_array_elements(vista->'cuotas') loop
    select * into config from public.configuraciones_mensuales where alumno_id = item->>'alumnoId';
    if not found or not config.habilitada or not exists(
      select 1 from public.alumnos where id = item->>'alumnoId' and estado = 'Activo') then
      raise exception 'Candidato no habilitado';
    end if;
    if (item->>'importe')::numeric <> config.importe
      or (item->>'vencimiento')::date <> inicio + (least(config.dia_vencimiento::integer, ultimo) - 1) then
      raise exception 'Importe o vencimiento incorrectos';
    end if;
  end loop;
  resultado := public.generar_cuotas_mensuales(current_setting('test.periodo'), vista->>'huella');
  if resultado->>'estado' <> 'confirmada' or (resultado->>'generadas')::integer <> esperadas
    or (resultado->>'fallidas')::integer <> 0 then raise exception 'Generación no confirmada'; end if;
  if esperadas > 0 then
    begin
      perform public.generar_cuotas_mensuales(current_setting('test.periodo'), vista->>'huella');
    exception when raise_exception then
      if SQLERRM = 'VISTA_MENSUAL_DESACTUALIZADA' then desactualizada := true; else raise; end if;
    end;
    if not desactualizada then raise exception 'Se aceptó una vista obsoleta'; end if;
  end if;
  actual := public.previsualizar_cuotas_mensuales(current_setting('test.periodo'));
  if jsonb_array_length(actual->'cuotas') <> 0 then raise exception 'Quedaron duplicados candidatos'; end if;
  resultado := public.generar_cuotas_mensuales(current_setting('test.periodo'), actual->>'huella');
  if (resultado->>'generadas')::integer <> 0 then raise exception 'Se duplicaron cuotas'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by id), '[]'::jsonb) into despues
    from public.cuotas c where id = any(ids);
  if despues is distinct from historicas then raise exception 'Se alteraron cuotas históricas'; end if;
end;
$$;
reset role;
rollback;
-- Ante error ejecutar ROLLBACK antes de corregir. No reemplazarlo por COMMIT.
