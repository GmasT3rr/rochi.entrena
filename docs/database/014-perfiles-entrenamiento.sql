-- REVISAR / ejecutar MANUALMENTE como postgres, una sola vez. No ejecutar desde Angular.
-- Requiere alumnos y aislamiento 005. No modifica esquema/RPC financieras ni Storage.
begin;
set local lock_timeout='10s';
do $$ begin
  if to_regprocedure('public.es_administrador_actual()') is null
    or to_regprocedure('rochy_privado.auditar()') is null
    or to_regprocedure('rochy_privado.marcar_actualizacion()') is null
    or to_regprocedure('rochy_privado.impedir_cambio_propietario()') is null then
    raise exception 'Falta el esquema administrativo y de aislamiento 005';
  end if;
end $$;

create table public.perfiles_entrenamiento (
  id uuid primary key default gen_random_uuid(),
  propietario_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  alumno_id text not null,
  -- Edad declarada al completar la ficha: no se deriva de fecha de nacimiento
  -- ni se incrementa con el paso del tiempo. Todos los datos declarados son NULL por defecto.
  edad_declarada integer check (edad_declarada between 0 and 130),
  altura_cm numeric check (altura_cm between 1 and 300 and altura_cm=round(altura_cm,2)),
  peso_kg numeric check (peso_kg between 0.01 and 1000 and peso_kg=round(peso_kg,2)),
  ciudad text check (btrim(ciudad)<>'' and length(ciudad)<=150),
  tiempo_entrenando text check (btrim(tiempo_entrenando)<>'' and length(tiempo_entrenando)<=300),
  realiza_cardio boolean,
  tipo_cardio text check (btrim(tipo_cardio)<>'' and length(tipo_cardio)<=300),
  frecuencia_cardio_semanal integer check (frecuencia_cardio_semanal between 0 and 100),
  duracion_cardio_minutos integer check (duracion_cardio_minutos between 1 and 1440),
  agua_litros_dia numeric check (agua_litros_dia between 0 and 30 and agua_litros_dia=round(agua_litros_dia,2)),
  alimentacion text check (alimentacion in ('Baja','Regular','Buena','Muy buena')),
  actividad_laboral text check (btrim(actividad_laboral)<>'' and length(actividad_laboral)<=500),
  horas_sueno numeric check (horas_sueno between 0 and 24 and horas_sueno=round(horas_sueno,2)),
  nivel_estres text check (nivel_estres in ('Bajo','Medio','Alto')),
  disponibilidad text check (btrim(disponibilidad)<>'' and length(disponibilidad)<=1500),
  objetivos text check (btrim(objetivos)<>'' and length(objetivos)<=3000),
  compromiso_asistencia boolean,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perfiles_entrenamiento_propietario_alumno_unique unique(propietario_id,alumno_id),
  constraint perfiles_entrenamiento_alumno_fkey foreign key(propietario_id,alumno_id)
    references public.alumnos(propietario_id,id) on delete restrict on update restrict
);
alter table public.perfiles_entrenamiento owner to postgres;
-- El UNIQUE cubre el acceso habitual por propietario/alumno. Índice para consulta/FK por alumno.
create index perfiles_entrenamiento_alumno_idx on public.perfiles_entrenamiento(alumno_id);
comment on column public.perfiles_entrenamiento.edad_declarada is 'Edad declarada al completar la ficha; no se actualiza automáticamente.';
alter table public.perfiles_entrenamiento enable row level security;
revoke all on public.perfiles_entrenamiento from public,anon,authenticated;
-- Escrituras exclusivamente por la RPC: DML directo permitiría omitir p_version.
grant select on public.perfiles_entrenamiento to authenticated;
create policy perfiles_administrador on public.perfiles_entrenamiento for all to authenticated
  using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))
  with check(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()));
create policy perfiles_aislamiento on public.perfiles_entrenamiento as restrictive for all to authenticated
  using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))
  with check(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()));

-- marcar_actualizacion reutiliza NEW.id, creado_en y actualizado_en. No conoce
-- esta tabla, por eso la inmutabilidad de alumno_id se verifica aparte.
create function rochy_privado.impedir_traslado_perfil() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if NEW.alumno_id is distinct from OLD.alumno_id then
    raise exception 'No se permite trasladar el perfil a otro alumno' using errcode='23514';
  end if;
  return NEW;
end $$;
alter function rochy_privado.impedir_traslado_perfil() owner to postgres;
revoke all on function rochy_privado.impedir_traslado_perfil() from public,anon,authenticated;
create trigger alumno_inmutable before update on public.perfiles_entrenamiento
  for each row execute function rochy_privado.impedir_traslado_perfil();
create trigger propietario_inmutable before update on public.perfiles_entrenamiento
  for each row execute function rochy_privado.impedir_cambio_propietario();
create trigger marcar_actualizacion before update on public.perfiles_entrenamiento
  for each row execute function rochy_privado.marcar_actualizacion();
-- Auditoría 005 copia actor/propietario. No registra documentos, bytes ni URLs.
create trigger auditar after insert or update or delete on public.perfiles_entrenamiento
  for each row execute function rochy_privado.auditar();

-- Compare-and-set: una carga fallida nunca se interpreta como permiso para
-- reemplazar un perfil existente con un formulario vacío. Idempotencia para una
-- respuesta perdida de alta/guardado, siempre que coincidan TODOS los datos.
-- DEFINER acotado a esta operación: sin DML cliente, owner postgres confiable,
-- search_path vacío y autorización/propietario explícitos en cada acceso de negocio.
-- RLS permanece habilitada para SELECT; no se conceden permisos amplios al cliente.
create function public.guardar_perfil_entrenamiento(p_alumno text,p_datos jsonb,p_version timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previo public.perfiles_entrenamiento; valores public.perfiles_entrenamiento;
  campo text; claves constant text[]:=array['edad_declarada','altura_cm','peso_kg','ciudad',
    'tiempo_entrenando','realiza_cardio','tipo_cardio','frecuencia_cardio_semanal','duracion_cardio_minutos',
    'agua_litros_dia','alimentacion','actividad_laboral','horas_sueno','nivel_estres','disponibilidad',
    'objetivos','compromiso_asistencia'];
begin
  if auth.uid() is null or public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  perform 1 from public.alumnos where propietario_id=auth.uid() and id=p_alumno for update;
  if not found then raise exception 'Alumno no disponible' using errcode='42501'; end if;
  if p_datos is null or jsonb_typeof(p_datos)<>'object' then
    raise exception 'Perfil inválido' using errcode='23514';
  end if;
  for campo in select jsonb_object_keys(p_datos) loop
    if not campo=any(claves) then raise exception 'Campo de perfil no permitido' using errcode='23514'; end if;
  end loop;
  -- Exigir un snapshot completo para no borrar campos por omisiones accidentales.
  if not (p_datos ?& claves) then raise exception 'Perfil incompleto en la solicitud' using errcode='23514'; end if;
  foreach campo in array claves loop
    if p_datos->campo='null'::jsonb then continue; end if;
    if campo=any(array['edad_declarada','altura_cm','peso_kg','frecuencia_cardio_semanal','duracion_cardio_minutos','agua_litros_dia','horas_sueno']) then
      if jsonb_typeof(p_datos->campo)<>'number' then raise exception 'Se esperaba un número' using errcode='23514'; end if;
      if campo=any(array['edad_declarada','frecuencia_cardio_semanal','duracion_cardio_minutos'])
        and (p_datos->>campo)::numeric<>trunc((p_datos->>campo)::numeric) then
        raise exception 'Se esperaba un número entero' using errcode='23514';
      end if;
    elsif campo=any(array['realiza_cardio','compromiso_asistencia']) then
      if jsonb_typeof(p_datos->campo)<>'boolean' then raise exception 'Se esperaba sí/no o NULL' using errcode='23514'; end if;
    elsif jsonb_typeof(p_datos->campo)<>'string' then
      raise exception 'Se esperaba texto' using errcode='23514';
    end if;
  end loop;
  valores:=jsonb_populate_record(null::public.perfiles_entrenamiento,p_datos);
  select * into previo from public.perfiles_entrenamiento where propietario_id=auth.uid() and alumno_id=p_alumno for update;
  if found then
    if (to_jsonb(previo)-array['id','propietario_id','alumno_id','creado_en','actualizado_en'])=
       (to_jsonb(valores)-array['id','propietario_id','alumno_id','creado_en','actualizado_en']) then return to_jsonb(previo); end if;
    if p_version is null or p_version is distinct from previo.actualizado_en then
      raise exception 'El perfil fue modificado por otra sesión' using errcode='40001';
    end if;
    update public.perfiles_entrenamiento set
      edad_declarada=valores.edad_declarada,altura_cm=valores.altura_cm,peso_kg=valores.peso_kg,ciudad=valores.ciudad,
      tiempo_entrenando=valores.tiempo_entrenando,realiza_cardio=valores.realiza_cardio,tipo_cardio=valores.tipo_cardio,
      frecuencia_cardio_semanal=valores.frecuencia_cardio_semanal,duracion_cardio_minutos=valores.duracion_cardio_minutos,
      agua_litros_dia=valores.agua_litros_dia,alimentacion=valores.alimentacion,actividad_laboral=valores.actividad_laboral,
      horas_sueno=valores.horas_sueno,nivel_estres=valores.nivel_estres,disponibilidad=valores.disponibilidad,
      objetivos=valores.objetivos,compromiso_asistencia=valores.compromiso_asistencia
      where id=previo.id and propietario_id=auth.uid() and alumno_id=p_alumno returning * into previo;
  else
    if p_version is not null then raise exception 'El perfil ya no está disponible' using errcode='40001'; end if;
    insert into public.perfiles_entrenamiento(propietario_id,alumno_id,edad_declarada,altura_cm,peso_kg,ciudad,
      tiempo_entrenando,realiza_cardio,tipo_cardio,frecuencia_cardio_semanal,duracion_cardio_minutos,
      agua_litros_dia,alimentacion,actividad_laboral,horas_sueno,nivel_estres,disponibilidad,objetivos,compromiso_asistencia)
    values(auth.uid(),p_alumno,valores.edad_declarada,valores.altura_cm,valores.peso_kg,valores.ciudad,
      valores.tiempo_entrenando,valores.realiza_cardio,valores.tipo_cardio,valores.frecuencia_cardio_semanal,valores.duracion_cardio_minutos,
      valores.agua_litros_dia,valores.alimentacion,valores.actividad_laboral,valores.horas_sueno,valores.nivel_estres,
      valores.disponibilidad,valores.objetivos,valores.compromiso_asistencia) returning * into previo;
  end if;
  return to_jsonb(previo);
end $$;
alter function public.guardar_perfil_entrenamiento(text,jsonb,timestamptz) owner to postgres;
revoke all on function public.guardar_perfil_entrenamiento(text,jsonb,timestamptz) from public,anon;
grant execute on function public.guardar_perfil_entrenamiento(text,jsonb,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
