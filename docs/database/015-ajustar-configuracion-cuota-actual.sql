-- PARA REVISIÓN E INSTALACIÓN MANUAL como postgres. NO APLICADA por el agente.
-- Requiere base, 001..005, 007 (inicio mensual) y 011 (snapshot financiero completo).
-- No cambia RLS, triggers financieros, generación mensual ni Cron.
-- Criterio acordado: alumno + mes actual argentino + concepto mensual normalizado.
-- El esquema no conserva procedencia manual/automática: no se infiere por UUID.
begin;
set local lock_timeout='10s';
do $$ begin
  if to_regprocedure('public.guardar_alumno_con_configuracion(text,boolean,jsonb)') is null
    or to_regprocedure('public.leer_cuentas_administrativas()') is null
    or to_regprocedure('rochy_privado.validar_importe_cuota()') is null
    or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='configuraciones_mensuales' and column_name='periodo_inicio')
    or to_regclass('public.cobros_directos') is null then
    raise exception 'Revisar e instalar las dependencias 005, 007 y 011 antes de 015';
  end if;
end $$;

create function public.ajustar_configuracion_y_cuota_actual(
  p_alumno text, p_configuracion jsonb, p_periodo text,
  p_version_configuracion timestamptz, p_cuota text,
  p_actualizado_cuota timestamptz, p_revision_cuota text
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare alumno public.alumnos; configuracion public.configuraciones_mensuales;
  cuota public.cuotas; inicio date; cantidad integer; abonado numeric;
  importe_nuevo public.importe_ars; resultado jsonb;
begin
  if auth.uid() is null or public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  inicio:=date_trunc('month',timezone('America/Argentina/Buenos_Aires',current_timestamp))::date;
  if p_periodo is distinct from to_char(inicio,'YYYY-MM') then
    raise exception 'El período actual cambió. Actualizar antes de guardar' using errcode='40001';
  end if;
  if p_configuracion is null or jsonb_typeof(p_configuracion) is distinct from 'object'
    or p_configuracion->'habilitada' is distinct from 'true'::jsonb
    or jsonb_typeof(p_configuracion->'importe') is distinct from 'number' then
    raise exception 'Configuración mensual inválida' using errcode='22023';
  end if;
  importe_nuevo:=(p_configuracion->>'importe')::public.importe_ars;
  -- Mismo orden de bloqueo que guardado/generación: alumno, configuración, cuota.
  select * into alumno from public.alumnos where id=p_alumno and propietario_id=auth.uid() for update;
  if not found then raise exception 'Alumno no disponible' using errcode='42501'; end if;
  select * into configuracion from public.configuraciones_mensuales
    where alumno_id=p_alumno and propietario_id=auth.uid() for update;
  if (found and (p_version_configuracion is null or p_version_configuracion is distinct from configuracion.actualizado_en))
    or (not found and p_version_configuracion is not null) then
    raise exception 'La configuración cambió. Actualizar antes de guardar' using errcode='40001';
  end if;
  select count(*) into cantidad from public.cuotas where propietario_id=auth.uid()
    and alumno_id=p_alumno and periodo=inicio
    and concepto_clave=rochy_privado.normalizar_concepto('Cuota de entrenamiento');
  if cantidad>1 then raise exception 'Cuota mensual ambigua' using errcode='22023'; end if;
  if cantidad=0 then
    if p_cuota is not null or p_actualizado_cuota is not null or p_revision_cuota is not null then
      raise exception 'La cuota ya no está disponible. Actualizar' using errcode='40001';
    end if;
  else
    select * into cuota from public.cuotas where propietario_id=auth.uid()
      and alumno_id=p_alumno and periodo=inicio
      and concepto_clave=rochy_privado.normalizar_concepto('Cuota de entrenamiento') for update;
    if not found or p_cuota is distinct from cuota.id
      or p_actualizado_cuota is null or p_actualizado_cuota is distinct from cuota.actualizado_en
      or p_revision_cuota is null or p_revision_cuota is distinct from cuota.revision::text then
      raise exception 'La cuota o sus pagos cambiaron. Actualizar' using errcode='40001';
    end if;
    select coalesce(sum(importe),0) into abonado from public.pagos
      where propietario_id=auth.uid() and cuota_id=cuota.id;
    if abonado>=cuota.importe then
      raise exception 'La cuota está pagada. Usar Editar cuota para una corrección expresa' using errcode='23514';
    end if;
  end if;
  -- Reutilizar la RPC existente con los datos personales RELEÍDOS bajo bloqueo:
  -- esta operación no sobrescribe un snapshot personal antiguo del navegador.
  resultado:=public.guardar_alumno_con_configuracion(p_alumno,false,jsonb_build_object(
    'nombre',alumno.nombre,'apellido',alumno.apellido,'telefono',alumno.telefono,
    'email',alumno.email,'modalidad',alumno.modalidad,'estado',alumno.estado,
    'fecha_ingreso',alumno.fecha_ingreso::text,'observaciones',alumno.observaciones,
    'configuracion_mensual',p_configuracion));
  if cantidad=1 then
    -- Solo importe; conserva vencimiento, concepto, período y TODOS los pagos.
    -- El dominio y validar_importe_cuota rechazan importe inferior a lo abonado,
    -- exactamente como UPDATE desde Editar cuota. Auditoría/timestamps existentes.
    update public.cuotas set importe=importe_nuevo
      where id=cuota.id and propietario_id=auth.uid();
    if not found then raise exception 'La cuota cambió' using errcode='40001'; end if;
  end if;
  -- Ningún EXCEPTION que oculte errores: cualquier fallo revierte ambas escrituras.
  -- Devolver el snapshot confirmado evita éxito con caché vieja o dos guardados.
  return jsonb_build_object('alumno',resultado,'cuentas',public.leer_cuentas_administrativas());
end $$;
alter function public.ajustar_configuracion_y_cuota_actual(text,jsonb,text,timestamptz,text,timestamptz,text) owner to postgres;
revoke all on function public.ajustar_configuracion_y_cuota_actual(text,jsonb,text,timestamptz,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ajustar_configuracion_y_cuota_actual(text,jsonb,text,timestamptz,text,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
commit;
