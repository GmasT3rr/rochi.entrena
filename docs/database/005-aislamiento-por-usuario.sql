-- 005: SOLO REVISIÓN / EJECUCIÓN MANUAL como postgres, tras respaldo verificado.
-- Requiere esquema original y 001..004. No instalar sin completar ambos mapas.
-- Transacción única: ante cualquier error ejecutar ROLLBACK. No continuar parcialmente.
begin;
set local lock_timeout = '10s';
lock table public.alumnos, public.configuraciones_mensuales, public.cuotas,
  public.pagos, rochy_privado.historial in access exclusive mode;

create temporary table asignacion_alumnos (
  alumno_id text primary key, propietario_id uuid not null
) on commit drop;
-- COMPLETAR EXPLÍCITAMENTE. Ejemplo de formato (no es una asignación):
-- [{"alumno_id":"ID_EXISTENTE","propietario_id":"UUID_AUTH_CORRECTO"}]
insert into asignacion_alumnos select * from jsonb_to_recordset('[]'::jsonb)
  as x(alumno_id text, propietario_id uuid);

create temporary table asignacion_historial (
  historial_id bigint primary key, propietario_id uuid not null
) on commit drop;
-- Asignar EXPLICITAMENTE CADA id de historial, incluido DELETE.
-- No inferir due?o por actor_id ni por reutilizaci?n de un ID de negocio.
-- [{"historial_id":123,"propietario_id":"UUID_AUTH_CORRECTO"}]
insert into asignacion_historial select * from jsonb_to_recordset('[]'::jsonb)
  as x(historial_id bigint, propietario_id uuid);

do $$ begin
  if exists(select 1 from asignacion_alumnos m left join auth.users u on u.id=m.propietario_id where u.id is null)
    or exists(select 1 from asignacion_historial m left join auth.users u on u.id=m.propietario_id where u.id is null) then
    raise exception 'Los mapas contienen UUID que no existen en Auth';
  end if;
  if exists(select 1 from (
    select propietario_id from asignacion_alumnos union select propietario_id from asignacion_historial
  ) m left join rochy_privado.administradores a on a.usuario_id=m.propietario_id
    where a.usuario_id is null or not a.activo) then
    raise exception 'Los propietarios elegidos deben ser administradores activos autorizados';
  end if;
  if exists(select 1 from public.alumnos a left join asignacion_alumnos m on m.alumno_id=a.id where m.alumno_id is null)
    or exists(select 1 from asignacion_alumnos m left join public.alumnos a on a.id=m.alumno_id where a.id is null) then
    raise exception 'Asignación de alumnos incompleta o con IDs inexistentes. No se aplicó aislamiento';
  end if;
  if exists(select 1 from asignacion_historial m left join rochy_privado.historial h on h.id=m.historial_id where h.id is null) then
    raise exception 'Asignación histórica con IDs inexistentes';
  end if;
end $$;

alter table public.alumnos add column propietario_id uuid references auth.users(id) on delete restrict;
alter table public.configuraciones_mensuales add column propietario_id uuid references auth.users(id) on delete restrict;
alter table public.cuotas add column propietario_id uuid references auth.users(id) on delete restrict;
alter table public.pagos add column propietario_id uuid references auth.users(id) on delete restrict;
alter table rochy_privado.historial add column propietario_id uuid references auth.users(id) on delete restrict;

-- Solo metadatos: no cambiar actualizado_en ni crear falsas modificaciones de negocio.
-- Los triggers financieros permanecen activos. Todo se restaura en esta transacción.
do $$ declare t text; begin
  foreach t in array array['alumnos','configuraciones_mensuales','cuotas','pagos'] loop
    execute format('alter table public.%I disable trigger auditar',t);
    execute format('alter table public.%I disable trigger marcar_actualizacion',t);
  end loop;
end $$;
create temporary table revisiones_antes on commit drop as select id,revision from public.cuotas;
update public.alumnos a set propietario_id=m.propietario_id from asignacion_alumnos m where m.alumno_id=a.id;
update public.configuraciones_mensuales c set propietario_id=a.propietario_id from public.alumnos a where a.id=c.alumno_id;
update public.cuotas c set propietario_id=a.propietario_id from public.alumnos a where a.id=c.alumno_id;
update public.pagos p set propietario_id=c.propietario_id from public.cuotas c where c.id=p.cuota_id;
-- validar_pago incrementa revision tambi?n en UPDATE de metadatos. Restaurar SOLO ese
-- contador bajo bloqueo exclusivo, conservando activos los triggers financieros.
update public.cuotas c set revision=r.revision from revisiones_antes r where r.id=c.id;

-- Historia existente: asignacion EXPLICITA por cada id; nunca inferida del actor.
update rochy_privado.historial h set propietario_id=m.propietario_id
  from asignacion_historial m where m.historial_id=h.id;
do $$ begin
  if exists(select 1 from rochy_privado.historial where propietario_id is null) then
    raise exception 'Falta asignar historial: completar asignacion_historial por cada ID';
  end if;
end $$;

alter table public.alumnos add constraint alumnos_propietario_id_id_unique unique(propietario_id,id);
alter table public.cuotas add constraint cuotas_propietario_id_id_unique unique(propietario_id,id);
-- Reemplazar FK simples, conservando nombres para no crear relaciones ambiguas en PostgREST.
alter table public.configuraciones_mensuales drop constraint configuraciones_mensuales_alumno_id_fkey;
alter table public.configuraciones_mensuales add constraint configuraciones_mensuales_alumno_id_fkey
  foreign key(propietario_id,alumno_id) references public.alumnos(propietario_id,id) on delete restrict on update restrict;
alter table public.cuotas drop constraint cuotas_alumno_id_fkey;
alter table public.cuotas add constraint cuotas_alumno_id_fkey
  foreign key(propietario_id,alumno_id) references public.alumnos(propietario_id,id) on delete restrict on update restrict;
alter table public.pagos drop constraint pagos_cuota_id_fkey;
alter table public.pagos add constraint pagos_cuota_id_fkey
  foreign key(propietario_id,cuota_id) references public.cuotas(propietario_id,id) on delete restrict on update restrict;

create function rochy_privado.impedir_cambio_propietario()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if NEW.propietario_id is distinct from OLD.propietario_id then
    raise exception 'No se permite cambiar propietario' using errcode='42501';
  end if;
  return NEW;
end $$;
alter function rochy_privado.impedir_cambio_propietario() owner to postgres;
revoke all on function rochy_privado.impedir_cambio_propietario() from public,anon,authenticated;

do $$ declare t text; p record; op text; begin
  foreach t in array array['alumnos','configuraciones_mensuales','cuotas','pagos'] loop
    execute format('alter table public.%I alter column propietario_id set not null',t);
    execute format('alter table public.%I alter column propietario_id set default auth.uid()',t);
    execute format('create index %I on public.%I(propietario_id)',t||'_propietario_idx',t);
    execute format('create trigger propietario_inmutable before update on public.%I for each row execute function rochy_privado.impedir_cambio_propietario()',t);
    execute format('alter table public.%I enable trigger auditar',t);
    execute format('alter table public.%I enable trigger marcar_actualizacion',t);
    execute format('alter table public.%I enable row level security',t);
    -- Eliminar todas las políticas antiguas: políticas permisivas se combinan con OR.
    for p in select polname from pg_catalog.pg_policy where polrelid=('public.'||t)::regclass loop
      execute format('drop policy %I on public.%I',p.polname,t);
    end loop;
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('create policy propietario_select on public.%I for select to authenticated using (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))',t);
    execute format('create policy propietario_insert on public.%I for insert to authenticated with check (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))',t);
    execute format('create policy propietario_update on public.%I for update to authenticated using (propietario_id=(select auth.uid()) and (select public.es_administrador_actual())) with check (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))',t);
    -- Defensa ante futuras políticas permisivas añadidas por error.
    execute format('create policy aislamiento_obligatorio on public.%I as restrictive for all to authenticated using (propietario_id=(select auth.uid()) and (select public.es_administrador_actual())) with check (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))',t);
    if t in ('cuotas','pagos') then
      execute format('grant delete on public.%I to authenticated',t);
      execute format('create policy propietario_delete on public.%I for delete to authenticated using (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))',t);
    end if;
  end loop;
end $$;

alter table rochy_privado.historial alter column propietario_id set not null;
create index historial_propietario_idx on rochy_privado.historial(propietario_id,ocurrido_en);
drop policy historial_lectura_admin on rochy_privado.historial;
create policy historial_lectura_propietario on rochy_privado.historial for select to authenticated
  using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()));
create policy historial_aislamiento on rochy_privado.historial as restrictive for select to authenticated
  using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()));
revoke all on rochy_privado.historial,rochy_privado.administradores from public,anon,authenticated;
grant select on rochy_privado.historial to authenticated;
-- historial no tiene DEFAULT: solo el trigger privilegiado copia el dueño de la fila.
create or replace function rochy_privado.auditar()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare antes jsonb; despues jsonb;
begin
  if TG_OP<>'INSERT' then antes:=to_jsonb(OLD); end if;
  if TG_OP<>'DELETE' then despues:=to_jsonb(NEW); end if;
  if TG_OP='UPDATE' and (antes-array['revision','creado_en','actualizado_en','concepto_clave'])
    is not distinct from (despues-array['revision','creado_en','actualizado_en','concepto_clave']) then return null; end if;
  insert into rochy_privado.historial(tabla,registro_id,operacion,anterior,nuevo,actor_id,propietario_id)
  values(TG_TABLE_NAME,coalesce(despues->>'id',despues->>'alumno_id',antes->>'id',antes->>'alumno_id'),
    TG_OP,antes,despues,auth.uid(),coalesce(despues->>'propietario_id',antes->>'propietario_id')::uuid);
  return null;
end $$;
alter function rochy_privado.auditar() owner to postgres;
revoke all on function rochy_privado.auditar() from public,anon,authenticated;

-- RPC: mismas firmas p?blicas, sin par?metro de propietario. Defensa expl?cita adem?s de RLS.

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
    where id = p_id and propietario_id = auth.uid() returning * into alumno;
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
    update public.configuraciones_mensuales set habilitada = false where alumno_id = p_id and propietario_id = auth.uid();
  end if;
  return to_jsonb(alumno) || jsonb_build_object('configuracion_mensual',
    (select to_jsonb(c) from public.configuraciones_mensuales c where c.alumno_id = p_id and c.propietario_id = auth.uid()));
end;
$$;
alter function public.guardar_alumno_con_configuracion(text, boolean, jsonb) owner to postgres;
revoke all on function public.guardar_alumno_con_configuracion(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_alumno_con_configuracion(text, boolean, jsonb) to authenticated;

create or replace function public.leer_cuentas_administrativas()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'version', 1,
      'alumnos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nombre', a.nombre, 'apellido', a.apellido,
        'modalidad', a.modalidad, 'estado', a.estado) order by a.id) from public.alumnos a where a.propietario_id = auth.uid()), '[]'::jsonb),
      'cuotas', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('revision', c.revision::text)
        order by c.id) from public.cuotas c where c.propietario_id = auth.uid()), '[]'::jsonb),
      'pagos', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.pagos p where p.propietario_id = auth.uid()), '[]'::jsonb)
    )
  );
end;
$$;
alter function public.leer_cuentas_administrativas() owner to postgres;
revoke all on function public.leer_cuentas_administrativas() from public, anon, authenticated;
grant execute on function public.leer_cuentas_administrativas() to authenticated;

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

create or replace function public.generar_cuotas_mensuales(p_periodo text, p_huella text)
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || p_periodo, 174338));
  -- Orden consistente con el guardado alumno/configuración de la RPC 002.
  -- Impide cambiar candidatos existentes mientras se valida y ejecuta el lote.
  perform a.id from public.alumnos a where a.propietario_id = auth.uid() order by a.id for update;
  perform c.alumno_id from public.configuraciones_mensuales c where c.propietario_id = auth.uid() order by c.alumno_id for update;
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
