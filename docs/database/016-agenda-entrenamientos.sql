-- 016: REVISIÓN E INSTALACIÓN MANUAL como postgres. El agente NO ejecuta este archivo.
-- Dependencias verificadas en rochy-propuesta.sql, 001 y 005. No modifica otros módulos.
begin;
set local lock_timeout = '10s';

do $$ begin
  if to_regprocedure('public.es_administrador_actual()') is null
    or to_regprocedure('rochy_privado.auditar()') is null
    or to_regprocedure('rochy_privado.marcar_actualizacion()') is null
    or to_regprocedure('rochy_privado.impedir_cambio_propietario()') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='alumnos' and column_name='id' and data_type='text' and is_nullable='NO')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='alumnos' and column_name='propietario_id' and data_type='uuid' and is_nullable='NO')
    or not exists(select 1 from information_schema.columns where table_schema='rochy_privado' and table_name='historial' and column_name='propietario_id' and is_nullable='NO') then
    raise exception 'Revisar esquema base, autorización 001 y aislamiento 005 antes de instalar Agenda';
  end if;
  -- 005 define UNIQUE(propietario_id,id). Una PK solo sobre id no alcanza
  -- para la FK compuesta: exigir una clave completa, válida y no diferible.
  -- No depender del nombre de la restricción ni alterar public.alumnos.
  if not exists(
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid=to_regclass('public.alumnos') and c.contype in ('p','u')
      and c.convalidated and not c.condeferrable and cardinality(c.conkey)=2
      and c.conkey @> array[
        (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='propietario_id' and not attisdropped),
        (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='id' and not attisdropped)
      ]::smallint[]
  ) then
    raise exception 'La FK de Agenda requiere UNIQUE o PK no diferible de alumnos(propietario_id,id). Revisar 005 sin modificar alumnos automáticamente';
  end if;
end $$;

create table public.agenda_entrenamientos (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  fecha date not null check(fecha between date '1900-01-01' and date '9999-12-31'),
  hora_inicio time without time zone not null,
  hora_fin time without time zone not null,
  titulo text check(length(titulo)<=120 and btrim(titulo)<>''),
  modalidad text not null check(modalidad in ('Presencial','Online')),
  observaciones text not null default '',
  estado text not null default 'programado' check(estado in ('programado','cancelado')),
  -- Snapshot canónico para unicidad. El trigger diferido exige su igualdad con la relación.
  alumno_ids text[] not null check(cardinality(alumno_ids)>0 and array_position(alumno_ids,null) is null),
  serie_id uuid,
  repeticion_dias integer[] not null default '{}' check(repeticion_dias <@ array[0,1,2,3,4,5,6] and array_position(repeticion_dias,null) is null),
  cancelado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint agenda_propietario_id_unique unique(propietario_id,id),
  constraint agenda_horario_valido check(hora_inicio < hora_fin and hora_inicio < time '24:00' and extract(second from hora_inicio)=0 and extract(second from hora_fin)=0),
  constraint agenda_cancelacion_valida check((estado='cancelado')=(cancelado_en is not null))
);
comment on table public.agenda_entrenamientos is 'Agenda local de America/Argentina/Buenos_Aires; fecha y horas civiles, sin conversión UTC. Auditoría en timestamptz.';
comment on column public.agenda_entrenamientos.hora_fin is '24:00 representa el final del mismo día. No admite entrenamientos que crucen medianoche.';
create unique index agenda_activo_no_duplicado on public.agenda_entrenamientos(propietario_id,fecha,hora_inicio,hora_fin,modalidad,alumno_ids) where estado='programado';
create index agenda_propietario_fecha_idx on public.agenda_entrenamientos(propietario_id,fecha,hora_inicio,id);
create index agenda_serie_idx on public.agenda_entrenamientos(propietario_id,serie_id) where serie_id is not null;

create table public.agenda_entrenamiento_alumnos (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  entrenamiento_id uuid not null,
  alumno_id text not null check(btrim(alumno_id)<>''),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint agenda_participante_unique unique(propietario_id,entrenamiento_id,alumno_id),
  constraint agenda_participante_entrenamiento_fkey foreign key(propietario_id,entrenamiento_id)
    references public.agenda_entrenamientos(propietario_id,id) on delete restrict on update restrict,
  constraint agenda_participante_alumno_fkey foreign key(propietario_id,alumno_id)
    references public.alumnos(propietario_id,id) on delete restrict on update restrict
);
create index agenda_participante_alumno_idx on public.agenda_entrenamiento_alumnos(propietario_id,alumno_id,entrenamiento_id);

-- Idempotencia por propietario y solicitud, incluso si se pierde la respuesta de un COMMIT.
-- Tabla privada sin permisos cliente; no es un sistema de autorización alternativo.
create table rochy_privado.agenda_solicitudes (
  propietario_id uuid not null references auth.users(id) on delete restrict,
  id uuid not null,
  solicitud jsonb not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now(),
  primary key(propietario_id,id)
);
alter table rochy_privado.agenda_solicitudes owner to postgres;
alter table rochy_privado.agenda_solicitudes enable row level security;
revoke all on rochy_privado.agenda_solicitudes from public,anon,authenticated;

-- Las escrituras se conceden solo a las RPC para no poder omitir validaciones,
-- control de versión, bloqueo por propietario o la transacción de participantes.
do $$ declare t text; begin
  foreach t in array array['agenda_entrenamientos','agenda_entrenamiento_alumnos'] loop
    execute format('alter table public.%I owner to postgres',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy agenda_propietario on public.%I for all to authenticated using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual())) with check(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))',t);
    execute format('create policy agenda_aislamiento on public.%I as restrictive for all to authenticated using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual())) with check(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))',t);
    execute format('create trigger propietario_inmutable before update on public.%I for each row execute function rochy_privado.impedir_cambio_propietario()',t);
    execute format('create trigger marcar_actualizacion before update on public.%I for each row execute function rochy_privado.marcar_actualizacion()',t);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function rochy_privado.auditar()',t);
  end loop;
end $$;

create function rochy_privado.validar_participantes_agenda() returns trigger
language plpgsql security definer set search_path='' as $$
declare entrenamiento uuid; propietario uuid; esperado text[]; reales text[];
begin
  -- Los registros de transición se eligen por operación, también al ejecutarse
  -- diferidamente: DELETE no tiene NEW e INSERT no tiene OLD.
  if TG_OP='DELETE' then
    if TG_TABLE_NAME='agenda_entrenamientos' then
      entrenamiento:=OLD.id; propietario:=OLD.propietario_id;
    else
      entrenamiento:=OLD.entrenamiento_id; propietario:=OLD.propietario_id;
    end if;
  elsif TG_OP in ('INSERT','UPDATE') then
    if TG_TABLE_NAME='agenda_entrenamientos' then
      entrenamiento:=NEW.id; propietario:=NEW.propietario_id;
    else
      entrenamiento:=NEW.entrenamiento_id; propietario:=NEW.propietario_id;
      if TG_OP='UPDATE' then
        if row(NEW.entrenamiento_id,NEW.alumno_id) is distinct from row(OLD.entrenamiento_id,OLD.alumno_id) then
          raise exception 'No se permite trasladar una participación' using errcode='23514';
        end if;
      end if;
    end if;
  else
    raise exception 'Operación de trigger de Agenda no admitida' using errcode='23514';
  end if;
  select alumno_ids into esperado from public.agenda_entrenamientos where id=entrenamiento and propietario_id=propietario;
  if not found then return null; end if;
  select array_agg(alumno_id order by alumno_id collate "C") into reales from public.agenda_entrenamiento_alumnos
    where entrenamiento_id=entrenamiento and propietario_id=propietario;
  if reales is null or esperado is distinct from reales then
    raise exception 'El entrenamiento requiere participantes canónicos del mismo propietario' using errcode='23514';
  end if;
  return null;
end $$;
alter function rochy_privado.validar_participantes_agenda() owner to postgres;
revoke all on function rochy_privado.validar_participantes_agenda() from public,anon,authenticated;
create constraint trigger agenda_participantes_completos after insert or update on public.agenda_entrenamientos
  deferrable initially deferred for each row execute function rochy_privado.validar_participantes_agenda();
create constraint trigger agenda_relacion_completa after insert or update or delete on public.agenda_entrenamiento_alumnos
  deferrable initially deferred for each row execute function rochy_privado.validar_participantes_agenda();

create function public.guardar_entrenamiento_agenda(
  p_solicitud uuid, p_periodo text, p_datos jsonb, p_dias integer[] default '{}',
  p_id uuid default null, p_version timestamptz default null, p_aceptar_superposicion boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare propietario uuid:=auth.uid(); previo public.agenda_entrenamientos; solicitud jsonb; repetida rochy_privado.agenda_solicitudes;
  fecha_base date; fecha_turno date; ultimo_dia date; inicio time; fin time; alumnos text[]; alumno text; campo text;
  dias integer[]; serie uuid; identificador uuid; cantidad integer:=0; resultado jsonb;
begin
  if propietario is null or public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  if p_solicitud is null or p_dias is null or p_aceptar_superposicion is null then
    raise exception 'Solicitud incompleta' using errcode='22023';
  end if;
  -- Serializa únicamente operaciones de Agenda del propietario, también entre sesiones.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda:'||propietario::text,0));
  solicitud:=jsonb_build_object('operacion','guardar','periodo',p_periodo,'datos',p_datos,'dias',p_dias,'id',p_id,'version',p_version,'aceptar',p_aceptar_superposicion);
  select * into repetida from rochy_privado.agenda_solicitudes where propietario_id=propietario and id=p_solicitud;
  if found then
    if repetida.solicitud is distinct from solicitud then raise exception 'Solicitud reutilizada con otros datos' using errcode='22023'; end if;
    return repetida.resultado;
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or p_periodo<'1900-01' or p_periodo>'9999-12'
    or jsonb_typeof(p_datos) is distinct from 'object'
    or p_datos-array['fecha','inicio','fin','titulo','modalidad','observaciones','alumno_ids']<>'{}'::jsonb then
    raise exception 'Datos de agenda inválidos' using errcode='22023';
  end if;
  foreach campo in array array['fecha','inicio','fin','modalidad','observaciones'] loop
    if jsonb_typeof(p_datos->campo) is distinct from 'string' then raise exception 'Falta un campo de entrenamiento' using errcode='22023'; end if;
  end loop;
  if (p_datos ? 'titulo' and jsonb_typeof(p_datos->'titulo') not in ('string','null'))
    or jsonb_typeof(p_datos->'alumno_ids') is distinct from 'array' then
    raise exception 'Título o alumnos inválidos' using errcode='22023';
  end if;
  if p_datos->>'fecha' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_datos->>'inicio' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_datos->>'fin' !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' then
    raise exception 'Fecha u horario inválido' using errcode='22023';
  end if;
  fecha_base:=(p_datos->>'fecha')::date; inicio:=(p_datos->>'inicio')::time; fin:=(p_datos->>'fin')::time;
  if to_char(fecha_base,'YYYY-MM')<>p_periodo or inicio>=fin then raise exception 'El turno debe finalizar el mismo día y pertenecer al mes seleccionado' using errcode='23514'; end if;
  if exists(select 1 from jsonb_array_elements(p_datos->'alumno_ids') x where jsonb_typeof(x) is distinct from 'string' or btrim(x#>>'{}')='') then
    raise exception 'Alumnos inválidos' using errcode='23514';
  end if;
  select array_agg(x order by x collate "C") into alumnos from jsonb_array_elements_text(p_datos->'alumno_ids') x;
  if coalesce(cardinality(alumnos),0)=0 or cardinality(alumnos)<>(select count(distinct x) from unnest(alumnos) x) then
    raise exception 'Debe elegir alumnos sin duplicados' using errcode='23514';
  end if;
  -- Bloqueos de alumnos impiden eliminación/traslado concurrente mientras se crean las FK.
  foreach alumno in array alumnos loop
    perform 1 from public.alumnos where id=alumno and propietario_id=propietario for key share;
    if not found then raise exception 'Alumno no disponible para este propietario' using errcode='42501'; end if;
  end loop;
  if exists(select 1 from unnest(p_dias) d where d is null or d<0 or d>6) then raise exception 'Días de repetición inválidos' using errcode='22023'; end if;
  select coalesce(array_agg(distinct d order by d),'{}'::integer[]) into dias from unnest(p_dias) d;
  if p_id is not null then
    if cardinality(dias)>0 then raise exception 'La edición afecta solo a esta ocurrencia' using errcode='22023'; end if;
    select * into previo from public.agenda_entrenamientos where id=p_id and propietario_id=propietario for update;
    if not found then raise exception 'Entrenamiento no disponible' using errcode='42501'; end if;
    if previo.estado<>'programado' or p_version is null or previo.actualizado_en is distinct from p_version then
      raise exception 'El entrenamiento cambió. Actualizá la agenda y volvé a abrirlo' using errcode='40001';
    end if;
    ultimo_dia:=fecha_base;
  else
    if p_version is not null then raise exception 'Versión inválida para alta' using errcode='22023'; end if;
    ultimo_dia:=(date_trunc('month',fecha_base)+interval '1 month - 1 day')::date;
    if cardinality(dias)>0 then serie:=gen_random_uuid(); end if;
  end if;
  -- Serie materializada finita. Nunca crea un Cron ni una regla para meses futuros.
  for fecha_turno in select fecha_base+i from generate_series(0,ultimo_dia-fecha_base) i
    where i=0 or extract(dow from fecha_base+i)::integer=any(dias) loop
    if exists(select 1 from public.agenda_entrenamientos t where t.propietario_id=propietario
      and t.estado='programado' and t.id is distinct from p_id and t.fecha=fecha_turno
      and t.hora_inicio<fin and inicio<t.hora_fin and t.alumno_ids && alumnos) then
      raise exception 'Un alumno ya tiene un entrenamiento en ese horario. Editá el turno existente para formar un grupo' using errcode='23P01';
    end if;
    if not p_aceptar_superposicion and exists(select 1 from public.agenda_entrenamientos t
      where t.propietario_id=propietario and t.estado='programado' and t.id is distinct from p_id
      and t.fecha=fecha_turno and t.hora_inicio<fin and inicio<t.hora_fin) then
      raise exception 'Hay horarios superpuestos. Revisalos y confirmá la superposición para continuar' using errcode='P0001';
    end if;
    if p_id is null then
      insert into public.agenda_entrenamientos(propietario_id,fecha,hora_inicio,hora_fin,titulo,modalidad,observaciones,alumno_ids,serie_id,repeticion_dias)
        values(propietario,fecha_turno,inicio,fin,nullif(btrim(p_datos->>'titulo'),''),p_datos->>'modalidad',p_datos->>'observaciones',alumnos,serie,dias) returning id into identificador;
    else
      identificador:=p_id;
      update public.agenda_entrenamientos set fecha=fecha_turno,hora_inicio=inicio,hora_fin=fin,
        titulo=nullif(btrim(p_datos->>'titulo'),''),modalidad=p_datos->>'modalidad',observaciones=p_datos->>'observaciones',alumno_ids=alumnos
        where id=p_id and propietario_id=propietario;
      delete from public.agenda_entrenamiento_alumnos where entrenamiento_id=p_id and propietario_id=propietario and not(alumno_id=any(alumnos));
    end if;
    insert into public.agenda_entrenamiento_alumnos(propietario_id,entrenamiento_id,alumno_id)
      select propietario,identificador,a from unnest(alumnos) a on conflict(propietario_id,entrenamiento_id,alumno_id) do nothing;
    cantidad:=cantidad+1;
  end loop;
  resultado:=jsonb_build_object('cantidad',cantidad);
  insert into rochy_privado.agenda_solicitudes(propietario_id,id,solicitud,resultado) values(propietario,p_solicitud,solicitud,resultado);
  return resultado;
end $$;

create function public.cancelar_entrenamiento_agenda(p_solicitud uuid,p_id uuid,p_version timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare propietario uuid:=auth.uid(); previo public.agenda_entrenamientos; solicitud jsonb; repetida rochy_privado.agenda_solicitudes; resultado jsonb;
begin
  if propietario is null or public.es_administrador_actual() is distinct from true then raise exception 'Acceso denegado' using errcode='42501'; end if;
  if p_solicitud is null or p_id is null or p_version is null then raise exception 'Solicitud incompleta' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda:'||propietario::text,0));
  solicitud:=jsonb_build_object('operacion','cancelar','id',p_id,'version',p_version);
  select * into repetida from rochy_privado.agenda_solicitudes where propietario_id=propietario and id=p_solicitud;
  if found then
    if repetida.solicitud is distinct from solicitud then raise exception 'Solicitud reutilizada con otros datos' using errcode='22023'; end if;
    return repetida.resultado;
  end if;
  select * into previo from public.agenda_entrenamientos where id=p_id and propietario_id=propietario for update;
  if not found then raise exception 'Entrenamiento no disponible' using errcode='42501'; end if;
  if previo.actualizado_en is distinct from p_version or previo.estado<>'programado' then
    raise exception 'El entrenamiento cambió. Actualizá la agenda y volvé a abrirlo' using errcode='40001';
  end if;
  update public.agenda_entrenamientos set estado='cancelado',cancelado_en=clock_timestamp() where id=p_id and propietario_id=propietario;
  resultado:=jsonb_build_object('cantidad',1);
  insert into rochy_privado.agenda_solicitudes(propietario_id,id,solicitud,resultado) values(propietario,p_solicitud,solicitud,resultado);
  return resultado;
end $$;

alter function public.guardar_entrenamiento_agenda(uuid,text,jsonb,integer[],uuid,timestamptz,boolean) owner to postgres;
alter function public.cancelar_entrenamiento_agenda(uuid,uuid,timestamptz) owner to postgres;
revoke all on function public.guardar_entrenamiento_agenda(uuid,text,jsonb,integer[],uuid,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.cancelar_entrenamiento_agenda(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.guardar_entrenamiento_agenda(uuid,text,jsonb,integer[],uuid,timestamptz,boolean) to authenticated;
grant execute on function public.cancelar_entrenamiento_agenda(uuid,uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
