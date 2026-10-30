-- VERIFICACIÓN MANUAL de 016. NO ejecutada por el agente.
-- 1) Ejecutar este bloque de catálogo como postgres después de instalar 016.
select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as propietario
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('agenda_entrenamientos','agenda_entrenamiento_alumnos'))
   or (n.nspname='rochy_privado' and c.relname='agenda_solicitudes');
select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('agenda_entrenamientos','agenda_entrenamiento_alumnos');
select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants
where table_name in ('agenda_entrenamientos','agenda_entrenamiento_alumnos','agenda_solicitudes')
  and grantee in ('PUBLIC','anon','authenticated') order by table_schema,table_name,grantee,privilege_type;
-- Esperado: authenticated SELECT en las dos tablas públicas; ningún DML ni acceso a la privada.
select p.proname,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid),
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_ejecuta,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as autenticado_ejecuta
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('guardar_entrenamiento_agenda','cancelar_entrenamiento_agenda');
-- Esperado: definer, search_path vacío, anon=false, authenticated=true.
select conrelid::regclass,conname,pg_get_constraintdef(oid),condeferrable,condeferred
from pg_constraint where conrelid in ('public.agenda_entrenamientos'::regclass,'public.agenda_entrenamiento_alumnos'::regclass);
-- Compatibilidad de FK: alumnos conserva id TEXT y propietario_id UUID, ambos NOT NULL.
select column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' and table_name='alumnos' and column_name in ('propietario_id','id');
select c.conname,pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable
from pg_constraint c where c.conrelid='public.alumnos'::regclass and c.contype in ('p','u');
-- Esperado: una fila por cada FK de Agenda (alumnos y entrenamientos), ambas válidas
-- y con clave referenciada completa/no diferible. No basta la PK de alumnos(id).
select fk.conname,fk.confrelid::regclass as tabla_referenciada,pg_get_constraintdef(fk.oid),fk.convalidated,
  exists(select 1 from pg_constraint clave where clave.conrelid=fk.confrelid
    and clave.contype in ('p','u') and clave.convalidated and not clave.condeferrable
    and cardinality(clave.conkey)=cardinality(fk.confkey) and clave.conkey @> fk.confkey) as clave_referenciada_compatible
from pg_constraint fk where fk.conrelid='public.agenda_entrenamiento_alumnos'::regclass and fk.contype='f'
  and fk.conname in ('agenda_participante_alumno_fkey','agenda_participante_entrenamiento_fkey');
select schemaname,tablename,indexname,indexdef from pg_indexes
where tablename in ('agenda_entrenamientos','agenda_entrenamiento_alumnos');
select event_object_table,trigger_name,event_manipulation,action_statement from information_schema.triggers
where event_object_schema='public' and event_object_table in ('agenda_entrenamientos','agenda_entrenamiento_alumnos');
-- Integridad: debe devolver cero filas, también para cancelados.
select t.id from public.agenda_entrenamientos t left join lateral (
  select array_agg(a.alumno_id order by a.alumno_id collate "C") as ids
  from public.agenda_entrenamiento_alumnos a where a.propietario_id=t.propietario_id and a.entrenamiento_id=t.id
) p on true where p.ids is distinct from t.alumno_ids;

-- 2) Prueba transaccional opcional. Seleccionar desde BEGIN hasta ROLLBACK.
-- COMPLETAR los dos UUID. A y B deben ser administradores activos diferentes.
-- A necesita al menos DOS alumnos propios y diciembre de 2099 libre en su agenda.
-- Si falta configuración, aborta ANTES de escribir. Ante un error ejecutar ROLLBACK.
begin;
select set_config('agenda.verificar_a','',true); -- COMPLETAR UUID Auth A
select set_config('agenda.verificar_b','',true); -- COMPLETAR UUID Auth B

do $$ begin
  if nullif(current_setting('agenda.verificar_a'),'') is null or nullif(current_setting('agenda.verificar_b'),'') is null
    or current_setting('agenda.verificar_a')=current_setting('agenda.verificar_b') then
    raise exception 'Completar dos propietarios de prueba distintos antes de continuar';
  end if;
  if not exists(select 1 from rochy_privado.administradores where usuario_id=current_setting('agenda.verificar_a')::uuid and activo)
    or not exists(select 1 from rochy_privado.administradores where usuario_id=current_setting('agenda.verificar_b')::uuid and activo) then
    raise exception 'Ambos propietarios deben ser administradores activos';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('agenda.verificar_a'),'role','authenticated')::text,true);

do $$ declare alumnos text[]; datos jsonb; resultado jsonb; request uuid:=gen_random_uuid(); turno uuid; version timestamptz; cantidad integer;
begin
  if public.es_administrador_actual() is distinct from true then raise exception 'A no autorizado'; end if;
  select array_agg(id order by id collate "C") into alumnos from (select id from public.alumnos order by id collate "C" limit 2) x;
  if cardinality(alumnos) is distinct from 2 then raise exception 'A requiere dos alumnos'; end if;
  if exists(select 1 from public.agenda_entrenamientos where fecha between date '2099-12-01' and date '2099-12-31') then raise exception 'Elegir un mes de prueba libre'; end if;
  datos:=jsonb_build_object('fecha','2099-12-28','inicio','09:00','fin','10:00','titulo','VERIFICACION ROLLBACK','modalidad','Presencial','observaciones','','alumno_ids',to_jsonb(alumnos));
  resultado:=public.guardar_entrenamiento_agenda(request,'2099-12',datos,array[1,3]);
  cantidad:=(resultado->>'cantidad')::integer;
  if cantidad<1 or exists(select 1 from public.agenda_entrenamientos where titulo='VERIFICACION ROLLBACK' and to_char(fecha,'YYYY-MM')<>'2099-12') then raise exception 'Repetición fuera de mes'; end if;
  if public.guardar_entrenamiento_agenda(request,'2099-12',datos,array[1,3]) is distinct from resultado then raise exception 'Replay distinto'; end if;
  if (select count(*) from public.agenda_entrenamientos where titulo='VERIFICACION ROLLBACK')<>cantidad then raise exception 'Duplicación tras replay'; end if;
  select id,actualizado_en into turno,version from public.agenda_entrenamientos where fecha=date '2099-12-28' and titulo='VERIFICACION ROLLBACK';
  perform set_config('agenda.verificar_turno',turno::text,true);
  perform set_config('agenda.verificar_version',version::text,true);
  perform set_config('agenda.verificar_alumno',alumnos[1],true);
  begin
    perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos);
    raise exception 'ERROR: duplicado aceptado';
  exception when exclusion_violation then null; end;
  begin
    perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos,'{}',turno,version-interval '1 second');
    raise exception 'ERROR: versión obsoleta aceptada';
  exception when serialization_failure then null; end;
  -- Regresión INSERT -> UPDATE -> DELETE de participación: alta con dos alumnos
  -- y edición de esa misma ocurrencia quitando el segundo, mediante la RPC real.
  if not exists(select 1 from public.agenda_entrenamientos where id=turno and propietario_id=auth.uid() and alumno_ids=alumnos)
    or (select array_agg(alumno_id order by alumno_id collate "C") from public.agenda_entrenamiento_alumnos
      where entrenamiento_id=turno and propietario_id=auth.uid()) is distinct from alumnos then
    raise exception 'Alta de grupo incompleta o desincronizada';
  end if;
  perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',
    datos||jsonb_build_object('titulo','VERIFICACION EDITADA','alumno_ids',jsonb_build_array(alumnos[1])),
    '{}',turno,version);
  if not exists(select 1 from public.agenda_entrenamientos where id=turno and propietario_id=auth.uid()
      and titulo='VERIFICACION EDITADA' and alumno_ids=array[alumnos[1]]) then
    raise exception 'La edición no actualizó el snapshot del entrenamiento';
  end if;
  if (select array_agg(alumno_id order by alumno_id collate "C") from public.agenda_entrenamiento_alumnos
      where entrenamiento_id=turno and propietario_id=auth.uid()) is distinct from array[alumnos[1]] then
    raise exception 'La edición no sincronizó la tabla de participantes';
  end if;
  if exists(select 1 from public.agenda_entrenamiento_alumnos where entrenamiento_id=turno and alumno_id=alumnos[2]) then
    raise exception 'La participación eliminada sigue presente';
  end if;
  if (select count(*) from public.agenda_entrenamientos where serie_id=(select serie_id from public.agenda_entrenamientos where id=turno))<>cantidad
    or exists(select 1 from public.agenda_entrenamientos where id<>turno
      and serie_id=(select serie_id from public.agenda_entrenamientos where id=turno) and alumno_ids is distinct from alumnos) then
    raise exception 'Editar una ocurrencia duplicó turnos o modificó los alumnos de otras repeticiones';
  end if;
  select actualizado_en into version from public.agenda_entrenamientos where id=turno;
  perform set_config('agenda.verificar_version',version::text,true);
  -- Dos entrenamientos simultáneos legítimos, con alumnos distintos.
  datos:=datos||jsonb_build_object('fecha','2099-12-01','titulo','VERIFICACION SIMULTANEA','alumno_ids',jsonb_build_array(alumnos[1]));
  perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos);
  datos:=datos||jsonb_build_object('alumno_ids',jsonb_build_array(alumnos[2]));
  begin
    perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos);
    raise exception 'ERROR: no advirtió superposición' using errcode='23514';
  exception when raise_exception then null; end;
  perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos,'{}',null,null,true);
  if (select count(*) from public.agenda_entrenamientos where fecha=date '2099-12-01' and titulo='VERIFICACION SIMULTANEA')<>2 then raise exception 'Simultáneos legítimos rechazados'; end if;
  -- Un conflicto en una repetición posterior debe revertir también el primer día del lote.
  datos:=datos||jsonb_build_object('fecha','2099-12-03','inicio','11:00','fin','12:00','titulo','VERIFICACION ATOMICA','alumno_ids',jsonb_build_array(alumnos[1]));
  perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos);
  begin
    perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos||jsonb_build_object('fecha','2099-12-02'),array[extract(dow from date '2099-12-03')::integer]);
    raise exception 'ERROR: repetición conflictiva aceptada';
  exception when exclusion_violation then null; end;
  if exists(select 1 from public.agenda_entrenamientos where fecha=date '2099-12-02' and titulo='VERIFICACION ATOMICA') then raise exception 'Lote parcialmente guardado'; end if;
end $$;
-- Fuerza las constraints diferidas ANTES de pasar a B. Incluye el DELETE de
-- la participación anterior: no dejar su validación pendiente hasta ROLLBACK.
set constraints all immediate;
set constraints all deferred;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('agenda.verificar_b'),'role','authenticated')::text,true);
do $$ declare datos jsonb;
begin
  if exists(select 1 from public.agenda_entrenamientos where id=current_setting('agenda.verificar_turno')::uuid)
    or exists(select 1 from public.agenda_entrenamiento_alumnos where entrenamiento_id=current_setting('agenda.verificar_turno')::uuid) then raise exception 'ERROR: B lee A'; end if;
  datos:=jsonb_build_object('fecha','2099-12-28','inicio','09:00','fin','10:00','titulo',null,'modalidad','Online','observaciones','','alumno_ids',jsonb_build_array(current_setting('agenda.verificar_alumno')));
  begin
    perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos);
    raise exception 'ERROR: B asigna alumno de A';
  exception when insufficient_privilege then null; end;
  begin
    perform public.guardar_entrenamiento_agenda(gen_random_uuid(),'2099-12',datos,'{}',current_setting('agenda.verificar_turno')::uuid,current_setting('agenda.verificar_version')::timestamptz);
    raise exception 'ERROR: B edita A';
  exception when insufficient_privilege then null; end;
  begin
    perform public.cancelar_entrenamiento_agenda(gen_random_uuid(),current_setting('agenda.verificar_turno')::uuid,current_setting('agenda.verificar_version')::timestamptz);
    raise exception 'ERROR: B cancela A';
  exception when insufficient_privilege then null; end;
  begin
    update public.agenda_entrenamientos set titulo='DML prohibido' where id=current_setting('agenda.verificar_turno')::uuid;
    raise exception 'ERROR: DML directo permitido';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('agenda.verificar_a'),'role','authenticated')::text,true);
do $$ declare request uuid:=gen_random_uuid(); resultado jsonb;
begin
  resultado:=public.cancelar_entrenamiento_agenda(request,current_setting('agenda.verificar_turno')::uuid,current_setting('agenda.verificar_version')::timestamptz);
  if public.cancelar_entrenamiento_agenda(request,current_setting('agenda.verificar_turno')::uuid,current_setting('agenda.verificar_version')::timestamptz) is distinct from resultado then raise exception 'Replay de cancelación inválido'; end if;
  if not exists(select 1 from public.agenda_entrenamientos where id=current_setting('agenda.verificar_turno')::uuid and estado='cancelado' and cancelado_en is not null) then raise exception 'Cancelación no persistida'; end if;
end $$;
set constraints all immediate;
-- JWT sin administrador autorizado: ninguna lectura ni escritura disponible.
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
do $$ begin
  if public.es_administrador_actual() is distinct from false or exists(select 1 from public.agenda_entrenamientos)
    or exists(select 1 from public.agenda_entrenamiento_alumnos) then raise exception 'ERROR: usuario no administrador accede'; end if;
  begin
    perform public.cancelar_entrenamiento_agenda(gen_random_uuid(),current_setting('agenda.verificar_turno')::uuid,current_setting('agenda.verificar_version')::timestamptz);
    raise exception 'ERROR: usuario no administrador modifica';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.agenda_entrenamientos;
    raise exception 'ERROR: anon lee';
  exception when insufficient_privilege then null; end;
  begin
    perform public.cancelar_entrenamiento_agenda(gen_random_uuid(),current_setting('agenda.verificar_turno')::uuid,current_setting('agenda.verificar_version')::timestamptz);
    raise exception 'ERROR: anon ejecuta RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Auditoría de las operaciones de prueba (todas se revertirán junto con los datos).
select tabla,operacion,actor_id,propietario_id,registro_id from rochy_privado.historial
where propietario_id=current_setting('agenda.verificar_a')::uuid and tabla in ('agenda_entrenamientos','agenda_entrenamiento_alumnos')
  and ocurrido_en>=transaction_timestamp() order by ocurrido_en;
rollback;
-- Nada de esta prueba de escritura debe persistir. No cambiar ROLLBACK por COMMIT.
