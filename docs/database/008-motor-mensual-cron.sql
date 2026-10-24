-- REVISIÓN MANUAL. Requiere 007. Función PRIVADA: no RPC del cliente.
begin;
create function rochy_privado.ejecutar_mensual(
  p_instante timestamptz default clock_timestamp(), p_origen text default 'cron')
returns jsonb language plpgsql security definer set search_path='' as $$
declare inicio date; ultimo_dia integer; ejecucion bigint; propietario uuid;
  total integer := 0; candidatas integer := 0; v_creadas integer := 0;
  codigo text; detalle text;
begin
  if p_instante is null or p_origen not in ('cron','recuperacion') or p_origen is null then
    raise exception 'Parametros invalidos' using errcode='22023';
  end if;
  inicio := date_trunc('month',timezone('America/Argentina/Buenos_Aires',p_instante))::date;
  if inicio not between date '1900-01-01' and date '9999-12-01' then
    raise exception 'Periodo invalido' using errcode='22023';
  end if;
  ultimo_dia := extract(day from (inicio::timestamp + interval '1 month - 1 day'))::integer;
  -- Serializa intentos automáticos (incluido el reintento diario).
  perform pg_catalog.pg_advisory_xact_lock(174339,1);
  insert into rochy_privado.ejecuciones_mensuales(periodo,origen,resultado)
    values(inicio,p_origen,'iniciada') returning id into ejecucion;
  if (select habilitada from rochy_privado.automatizacion_mensual where id) is distinct from true then
    update rochy_privado.ejecuciones_mensuales set resultado='deshabilitada',finalizada_en=clock_timestamp() where id=ejecucion;
    return jsonb_build_object('ejecucion',ejecucion,'estado','deshabilitada','generadas',0,'omitidas',0,'fallidas',0);
  end if;
  begin
    -- Mismas claves/orden que el lote manual. No simular sesiones ni JWT.
    for propietario in select usuario_id from rochy_privado.administradores where activo order by usuario_id loop
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(propietario::text || ':' || to_char(inicio,'YYYY-MM'),174338));
    end loop;
    perform a.id from public.alumnos a join rochy_privado.administradores ad on ad.usuario_id=a.propietario_id and ad.activo order by a.id for update of a;
    perform c.alumno_id from public.configuraciones_mensuales c join rochy_privado.administradores ad on ad.usuario_id=c.propietario_id and ad.activo order by c.alumno_id for update of c;
    select count(*) into total from public.alumnos a join rochy_privado.administradores ad on ad.usuario_id=a.propietario_id and ad.activo;
    select count(*) into candidatas from public.alumnos a
      join rochy_privado.administradores ad on ad.usuario_id=a.propietario_id and ad.activo
      join public.configuraciones_mensuales c on c.alumno_id=a.id and c.propietario_id=a.propietario_id
      where a.estado='Activo' and c.habilitada and c.periodo_inicio<=inicio
        and a.fecha_ingreso < (inicio::timestamp + interval '1 month')::date
        and not exists(select 1 from public.cuotas q where q.alumno_id=a.id and q.propietario_id=a.propietario_id and q.periodo=inicio
          and q.concepto_clave=rochy_privado.normalizar_concepto('Cuota de entrenamiento'));
    insert into public.cuotas(propietario_id,alumno_id,concepto,periodo,importe,vencimiento,observaciones)
      select a.propietario_id,a.id,'Cuota de entrenamiento',inicio,c.importe,
        inicio+(least(c.dia_vencimiento::integer,ultimo_dia)-1),''
      from public.alumnos a
      join rochy_privado.administradores ad on ad.usuario_id=a.propietario_id and ad.activo
      join public.configuraciones_mensuales c on c.alumno_id=a.id and c.propietario_id=a.propietario_id
      where a.estado='Activo' and c.habilitada and c.periodo_inicio<=inicio
        and a.fecha_ingreso < (inicio::timestamp + interval '1 month')::date
      order by a.id
      on conflict on constraint cuotas_alumno_periodo_concepto_unique do nothing;
    get diagnostics v_creadas = row_count;
  exception when others then
    -- Subtransacción: TODAS las cuotas/auditorías del intento se revierten.
    -- El registro del fallo queda fuera de esa subtransacción y se confirma al retornar.
    get stacked diagnostics codigo=returned_sqlstate,detalle=message_text;
    update rochy_privado.ejecuciones_mensuales set resultado='error',creadas=0,
      omitidas=greatest(total-candidatas,0),errores=greatest(candidatas,1),
      codigo_error=codigo,detalle_error=left(detalle,500),finalizada_en=clock_timestamp() where id=ejecucion;
    return jsonb_build_object('ejecucion',ejecucion,'estado','error','generadas',0,'omitidas',greatest(total-candidatas,0),'fallidas',greatest(candidatas,1));
  end;
  update rochy_privado.ejecuciones_mensuales set resultado='confirmada',creadas=v_creadas,
    omitidas=total-v_creadas,finalizada_en=clock_timestamp() where id=ejecucion;
  return jsonb_build_object('ejecucion',ejecucion,'estado','confirmada','generadas',v_creadas,'omitidas',total-v_creadas,'fallidas',0);
end $$;
-- Alcance privilegiado deliberado: Cron atiende a todos los propietarios activos,
-- sin conceder BYPASSRLS ni permisos nuevos sobre negocio a roles de la aplicación.
alter function rochy_privado.ejecutar_mensual(timestamptz,text) owner to postgres;
revoke all on function rochy_privado.ejecutar_mensual(timestamptz,text) from public,anon,authenticated;
commit;
