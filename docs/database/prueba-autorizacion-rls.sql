-- PRUEBA MANUAL, NO ES UNA MIGRACIÓN. Proyecto de pruebas, SQL Editor como postgres.
-- Requiere la migración 001 y dos usuarios Auth existentes. No crea usuarios.
-- Reemplazar los dos UUID. Todo cambio de datos se revierte con ROLLBACK.
-- Ante un error, ejecutar ROLLBACK antes de corregir/reintentar.
begin;
select set_config('test.admin_id', 'REEMPLAZAR_UUID_ADMIN_ACTIVO', true);
select set_config('test.noadmin_id', 'REEMPLAZAR_UUID_USUARIO_NO_ADMIN', true);
select set_config('test.fixture_id', 'audit-' || gen_random_uuid()::text, true);

do $$
begin
  if not exists (select 1 from rochy_privado.administradores
    where usuario_id = current_setting('test.admin_id')::uuid and activo) then
    raise exception 'Se requiere un administrador activo existente';
  end if;
  if not exists (select 1 from auth.users where id = current_setting('test.noadmin_id')::uuid)
    or exists (select 1 from rochy_privado.administradores
      where usuario_id = current_setting('test.noadmin_id')::uuid and activo) then
    raise exception 'Se requiere un usuario Auth existente sin administración activa';
  end if;
end;
$$;

insert into public.alumnos(id, nombre, apellido, modalidad, fecha_ingreso)
values (current_setting('test.fixture_id'), 'Prueba RLS', 'Temporal', 'Online', current_date);
insert into public.configuraciones_mensuales(alumno_id, importe, dia_vencimiento)
values (current_setting('test.fixture_id'), 100, 1);
insert into public.cuotas(id, alumno_id, concepto, periodo, importe, vencimiento)
values (current_setting('test.fixture_id'), current_setting('test.fixture_id'), 'Prueba RLS',
  date_trunc('month', current_date)::date, 100, current_date);
insert into public.pagos(id, cuota_id, importe, fecha, medio)
values (current_setting('test.fixture_id'), current_setting('test.fixture_id'), 10, current_date, 'Otro');

-- Helper temporal, SECURITY INVOKER: las consultas se ejecutan con el rol probado.
create function pg_temp.comprobar_denegacion(anonimo boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare tabla text; clave text; cantidad bigint; denegado boolean; sentencia text;
begin
  if anonimo then
    denegado := false;
    begin perform public.es_administrador_actual();
    exception when insufficient_privilege then denegado := true; end;
    if not denegado then raise exception 'anon puede ejecutar la RPC'; end if;
  elsif public.es_administrador_actual() is distinct from false then
    raise exception 'La RPC no devolvió false para el usuario sin permisos';
  end if;
  foreach tabla in array array['alumnos', 'configuraciones_mensuales', 'cuotas', 'pagos'] loop
    clave := case when tabla = 'configuraciones_mensuales' then 'alumno_id' else 'id' end;
    cantidad := 0;
    begin
      execute format('select count(*) from public.%I where %I = $1', tabla, clave)
        into cantidad using current_setting('test.fixture_id');
    exception when insufficient_privilege then cantidad := 0; end;
    if cantidad <> 0 then raise exception 'Lectura indebida en %', tabla; end if;
    cantidad := 0;
    begin
      sentencia := case when tabla = 'configuraciones_mensuales' then 'habilitada = true'
        else 'observaciones = ''CAMBIO NO PERMITIDO''' end;
      execute format('update public.%I set %s where %I = $1', tabla, sentencia, clave)
        using current_setting('test.fixture_id');
      get diagnostics cantidad = row_count;
    exception when insufficient_privilege then cantidad := 0; end;
    if cantidad <> 0 then raise exception 'UPDATE indebido en %', tabla; end if;
    cantidad := 0;
    begin
      execute format('delete from public.%I where %I = $1', tabla, clave)
        using current_setting('test.fixture_id');
      get diagnostics cantidad = row_count;
    exception when insufficient_privilege then cantidad := 0; end;
    if cantidad <> 0 then raise exception 'DELETE indebido en %', tabla; end if;
  end loop;
  denegado := false;
  begin
    insert into public.alumnos(id, nombre, apellido, modalidad, fecha_ingreso)
    values (current_setting('test.fixture_id') || '-prohibido', 'Prueba', 'Prohibida', 'Online', current_date);
  exception when insufficient_privilege then denegado := true; end;
  if not denegado then raise exception 'INSERT indebido de alumno'; end if;
  -- La tabla privada nunca debe ser legible/modificable por estos roles.
  denegado := false;
  begin perform 1 from rochy_privado.administradores;
  exception when insufficient_privilege then denegado := true; end;
  if not denegado then raise exception 'Tabla privada legible'; end if;
  denegado := false;
  begin update rochy_privado.administradores set activo = true where false;
  exception when insufficient_privilege then denegado := true; end;
  if not denegado then raise exception 'Permiso UPDATE sobre administradores'; end if;
end;
$$;
do $$ begin
  execute format('grant usage on schema %I to anon, authenticated',
    pg_my_temp_schema()::regnamespace::text);
end; $$;
grant execute on function pg_temp.comprobar_denegacion(boolean) to anon, authenticated;

-- Sin sesión: RPC no ejecutable, datos inaccesibles.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select pg_temp.comprobar_denegacion(true);
reset role;

-- Usuario autenticado sin administración activa.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.noadmin_id'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.comprobar_denegacion(false);
reset role;

-- Administrador activo: comprobar true explícito Y lectura de fixtures existentes.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.admin_id'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare tabla text; clave text; cantidad bigint;
begin
  if public.es_administrador_actual() is distinct from true then raise exception 'Falta autorización'; end if;
  foreach tabla in array array['alumnos', 'configuraciones_mensuales', 'cuotas', 'pagos'] loop
    clave := case when tabla = 'configuraciones_mensuales' then 'alumno_id' else 'id' end;
    execute format('select count(*) from public.%I where %I = $1', tabla, clave)
      into cantidad using current_setting('test.fixture_id');
    if cantidad <> 1 then raise exception 'El admin no ve el fixture en %', tabla; end if;
  end loop;
  update public.alumnos set observaciones = 'Admin autorizado' where id = current_setting('test.fixture_id');
  get diagnostics cantidad = row_count;
  if cantidad <> 1 then raise exception 'UPDATE autorizado falló'; end if;
end;
$$;
reset role;

-- Desactivar dentro de esta transacción, sin emitir otro JWT: debe perder acceso.
update rochy_privado.administradores set activo = false
where usuario_id = current_setting('test.admin_id')::uuid;
set local role authenticated;
select pg_temp.comprobar_denegacion(false);
reset role;

-- Validar los fixtures como propietario después de los intentos denegados.
do $$
begin
  if (select count(*) from public.alumnos where id = current_setting('test.fixture_id')) <> 1
    or not exists (select 1 from public.alumnos where id = current_setting('test.fixture_id') and observaciones = 'Admin autorizado')
    or not exists (select 1 from public.configuraciones_mensuales where alumno_id = current_setting('test.fixture_id') and not habilitada)
    or not exists (select 1 from public.cuotas where id = current_setting('test.fixture_id') and observaciones = '')
    or not exists (select 1 from public.pagos where id = current_setting('test.fixture_id') and observaciones = '') then
    raise exception 'Los intentos denegados alteraron los fixtures';
  end if;
end;
$$;
rollback;
-- Si no hubo errores, las aserciones pasaron. Fixtures y desactivación revertidos.
