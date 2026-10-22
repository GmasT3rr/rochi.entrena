-- ROCHY: PROPUESTA PARA REVISAR. NO EJECUTADA.
-- Destino: Supabase PostgreSQL (UTF8, PostgreSQL >= 15).
-- Instalar en un proyecto nuevo, como postgres (propietario confiable).
-- No contiene datos, usuarios, credenciales, imports ni tareas programadas.
-- No es una migración incremental ni un script para repetir sobre tablas existentes.
begin;

create schema rochy_privado;
revoke all on schema rochy_privado from public, anon, authenticated;

-- NUMERIC sin escala forzada: rechaza fracciones de centavo en vez de redondearlas.
create domain public.importe_ars as numeric
  check (value > 0 and value <= 999999999.99 and value = round(value, 2));

-- Equivalente a normalizarConcepto(): NFD, quitar marcas, colapsar whitespace JS,
-- trim y minúsculas. No se altera el concepto visible/original.
create function rochy_privado.normalizar_concepto(texto text)
returns text language sql immutable strict set search_path = '' as $$
  select lower(btrim(regexp_replace(
    regexp_replace(normalize(texto, NFD), U&'[\0300-\036f]', '', 'g'),
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'
  )));
$$;

-- Lista de autorización independiente de user_metadata/JWT editable por el usuario.
-- No se crea ningún administrador automáticamente al registrarse en Auth.
create table rochy_privado.administradores (
  usuario_id uuid primary key references auth.users(id) on delete restrict,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table rochy_privado.administradores enable row level security;
-- Sin políticas ni grants de escritura para clientes: alta/baja solo por operador confiable.

create function rochy_privado.es_administrador()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rochy_privado.administradores
    where usuario_id = (select auth.uid()) and activo
  );
$$;

create table public.alumnos (
  -- TEXT preserva tanto IDs antiguos ('1', etc.) como crypto.randomUUID().
  id text primary key default gen_random_uuid()::text check (btrim(id) <> ''),
  nombre text not null check (btrim(nombre) <> ''),
  apellido text not null check (btrim(apellido) <> ''),
  telefono text not null default '',
  email text not null default '',
  modalidad text not null check (modalidad in ('Presencial', 'Online')),
  estado text not null default 'Activo' check (estado in ('Activo', 'En pausa', 'Inactivo')),
  fecha_ingreso date not null check (fecha_ingreso between date '1900-01-01' and date '9999-12-31'),
  observaciones text not null default '',
  -- Compatibilidad con proximaCuota opcional del prototipo; no gobierna saldos.
  proxima_cuota_original text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.configuraciones_mensuales (
  alumno_id text primary key references public.alumnos(id) on delete restrict on update restrict,
  habilitada boolean not null default false,
  -- Si existe configuración, siempre tiene valores válidos, incluso deshabilitada.
  -- Ausencia de fila = configuración inexistente/deshabilitada (alumnos anteriores).
  importe public.importe_ars not null,
  dia_vencimiento smallint not null check (dia_vencimiento between 1 and 31),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.cuotas (
  id text primary key default gen_random_uuid()::text check (btrim(id) <> ''),
  alumno_id text not null references public.alumnos(id) on delete restrict on update restrict,
  concepto text not null,
  concepto_clave text collate "C" generated always as (rochy_privado.normalizar_concepto(concepto)) stored,
  -- YYYY-MM del cliente se representa por el primer día del mes.
  periodo date not null check (periodo between date '1900-01-01' and date '9999-12-01' and extract(day from periodo) = 1),
  importe public.importe_ars not null,
  vencimiento date not null check (vencimiento between date '1900-01-01' and date '9999-12-31'),
  observaciones text not null default '',
  -- Serializa modificaciones financieras de la misma cuota, incluidos pagos concurrentes.
  revision bigint not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint concepto_no_vacio check (concepto_clave <> ''),
  constraint cuotas_alumno_periodo_concepto_unique unique (alumno_id, periodo, concepto_clave)
);

create table public.pagos (
  id text primary key default gen_random_uuid()::text check (btrim(id) <> ''),
  cuota_id text not null references public.cuotas(id) on delete restrict on update restrict,
  importe public.importe_ars not null,
  fecha date not null check (fecha between date '1900-01-01' and date '9999-12-31'),
  medio text not null check (medio in ('Efectivo', 'Transferencia', 'Otro')),
  observaciones text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index alumnos_estado_idx on public.alumnos(estado);
create index cuotas_periodo_idx on public.cuotas(periodo);
create index cuotas_vencimiento_idx on public.cuotas(vencimiento);
create index pagos_cuota_idx on public.pagos(cuota_id);
create index pagos_fecha_idx on public.pagos(fecha);
-- La restricción única ya indexa cuotas.alumno_id; la PK indexa configuraciones.alumno_id.

create table rochy_privado.historial (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  anterior jsonb,
  nuevo jsonb,
  actor_id uuid, -- Sin FK: conserva autoría aunque luego se elimine el usuario Auth.
  ocurrido_en timestamptz not null default clock_timestamp()
);
create index historial_registro_idx on rochy_privado.historial(tabla, registro_id, ocurrido_en);
alter table rochy_privado.historial enable row level security;
create policy historial_lectura_admin on rochy_privado.historial for select to authenticated
  using ((select rochy_privado.es_administrador()));
-- Sin INSERT/UPDATE/DELETE desde el cliente. Escritura solo por trigger del propietario.

create function rochy_privado.auditar()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare antes jsonb; despues jsonb;
begin
  if TG_OP <> 'INSERT' then antes := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then despues := to_jsonb(NEW); end if;
  -- AFTER: concepto_clave ya está calculado. Ignorar cambios exclusivamente técnicos
  -- y UPDATE sin cambios de negocio, sin ocultar altas, bajas ni cambios en pagos.
  if TG_OP = 'UPDATE' then
    if (antes - array['revision', 'creado_en', 'actualizado_en', 'concepto_clave'])
      is not distinct from
      (despues - array['revision', 'creado_en', 'actualizado_en', 'concepto_clave']) then
      return null;
    end if;
  end if;
  insert into rochy_privado.historial(tabla, registro_id, operacion, anterior, nuevo, actor_id)
  values (TG_TABLE_NAME, coalesce(despues->>'id', despues->>'alumno_id', antes->>'id', antes->>'alumno_id'),
    TG_OP, antes, despues, auth.uid());
  return null;
end;
$$;

create function rochy_privado.marcar_actualizacion()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- No inspeccionar NEW completo: cuotas.concepto_clave es generado y todavía
  -- no está disponible en BEFORE. La configuración usa una PK distinta.
  if TG_TABLE_NAME = 'configuraciones_mensuales' then
    if NEW.alumno_id is distinct from OLD.alumno_id then
      raise exception 'No se permite trasladar la configuración a otro alumno';
    end if;
  else
    if NEW.id is distinct from OLD.id then
      raise exception 'No se permite modificar el identificador';
    end if;
  end if;
  if TG_TABLE_NAME = 'cuotas' then
    if NEW.alumno_id is distinct from OLD.alumno_id then
      raise exception 'Una cuota no puede trasladarse a otro alumno';
    end if;
  end if;
  NEW.creado_en := OLD.creado_en;
  NEW.actualizado_en := clock_timestamp();
  if TG_TABLE_NAME = 'cuotas' then
    if row(NEW.id, NEW.alumno_id, NEW.concepto, NEW.periodo, NEW.importe,
           NEW.vencimiento, NEW.observaciones)
      is not distinct from
       row(OLD.id, OLD.alumno_id, OLD.concepto, OLD.periodo, OLD.importe,
           OLD.vencimiento, OLD.observaciones) then
      -- Un pago modifica revision para bloquear la cuota, pero no sus datos.
      NEW.actualizado_en := OLD.actualizado_en;
    end if;
  end if;
  return NEW;
end;
$$;

-- Pagos parciales: no hay UNIQUE(cuota_id); cada pago conserva su ID e historial.
-- Se escribe la fila padre para serializar pagos simultáneos y cambios de importe.
-- En REPEATABLE READ/SERIALIZABLE un conflicto puede abortar: la futura API debe reintentar.
create function rochy_privado.validar_pago()
returns trigger language plpgsql volatile set search_path = '' as $$
declare limite numeric; abonado numeric; referencia text;
begin
  if TG_OP = 'UPDATE' then
    if NEW.cuota_id is distinct from OLD.cuota_id then
      raise exception 'Un pago no puede trasladarse a otra cuota';
    end if;
  end if;
  if TG_OP = 'DELETE' then referencia := OLD.cuota_id; else referencia := NEW.cuota_id; end if;
  -- Mantener este UPDATE real: solo SELECT FOR UPDATE no produciría una nueva
  -- versión de la cuota para detectar snapshots obsoletos en REPEATABLE READ.
  update public.cuotas set revision = revision + 1 where id = referencia returning importe into limite;
  if not found then raise exception 'La cuota no existe'; end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  if NEW.fecha > (current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'La fecha del pago no puede ser futura';
  end if;
  -- Otra sentencia después de obtener el bloqueo: en READ COMMITTED relee pagos
  -- ya confirmados por el escritor anterior. No convertir la función en STABLE.
  select coalesce(sum(importe), 0) into abonado from public.pagos
    where cuota_id = referencia and id <> NEW.id;
  if abonado + NEW.importe > limite then raise exception 'El pago supera el saldo disponible'; end if;
  return NEW;
end;
$$;

create function rochy_privado.validar_importe_cuota()
returns trigger language plpgsql volatile set search_path = '' as $$
begin
  if NEW.importe is distinct from OLD.importe then
    if NEW.importe < (select coalesce(sum(importe), 0) from public.pagos where cuota_id = OLD.id) then
      raise exception 'El importe no puede ser menor al total abonado';
    end if;
  end if;
  return NEW;
end;
$$;
create trigger cuotas_validar_importe before update on public.cuotas
  for each row execute function rochy_privado.validar_importe_cuota();
create trigger pagos_validar before insert or update or delete on public.pagos
  for each row execute function rochy_privado.validar_pago();

-- Todas las tablas operativas: RLS para una única administración del estudio.
-- No hay aislamiento por alumno ni cuentas de alumnos: ellos no son usuarios Auth.
do $$
declare tabla text;
begin
  foreach tabla in array array['alumnos', 'configuraciones_mensuales', 'cuotas', 'pagos'] loop
    execute format('alter table public.%I enable row level security', tabla);
    execute format('revoke all on public.%I from public, anon, authenticated', tabla);
    execute format('grant select, insert, update on public.%I to authenticated', tabla);
    execute format('create policy leer_admin on public.%I for select to authenticated using ((select rochy_privado.es_administrador()))', tabla);
    execute format('create policy insertar_admin on public.%I for insert to authenticated with check ((select rochy_privado.es_administrador()))', tabla);
    execute format('create policy editar_admin on public.%I for update to authenticated using ((select rochy_privado.es_administrador())) with check ((select rochy_privado.es_administrador()))', tabla);
    execute format('create trigger marcar_actualizacion before update on public.%I for each row execute function rochy_privado.marcar_actualizacion()', tabla);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function rochy_privado.auditar()', tabla);
  end loop;
end;
$$;
-- Compatibilidad con ABM actuales: pagos pueden eliminarse y cuotas solo sin pagos (FK RESTRICT).
-- La auditoría conserva los valores previos incluso después del DELETE.
grant delete on public.cuotas, public.pagos to authenticated;
create policy eliminar_admin on public.cuotas for delete to authenticated
  using ((select rochy_privado.es_administrador()));
create policy eliminar_admin on public.pagos for delete to authenticated
  using ((select rochy_privado.es_administrador()));
-- Alumnos: sin DELETE. Bajas/reingresos mediante estado, sin borrar deuda o pagos.
-- Configuración: sin DELETE; deshabilitar mediante habilitada=false.

revoke all on rochy_privado.administradores, rochy_privado.historial from public, anon, authenticated;
-- El identity del historial tampoco debe heredar permisos amplios del proyecto.
revoke all on all sequences in schema rochy_privado from public, anon, authenticated;
grant usage on schema rochy_privado to authenticated;
grant usage on schema public to authenticated;
grant select on rochy_privado.historial to authenticated;
revoke execute on all functions in schema rochy_privado from public, anon, authenticated;
grant execute on function rochy_privado.es_administrador() to authenticated;
grant execute on function rochy_privado.normalizar_concepto(text) to authenticated;
-- Propietario explícito para las funciones privilegiadas y sus tablas de respaldo.
-- El SQL se instala como postgres; no delegar estos objetos a roles de aplicación.
alter schema rochy_privado owner to postgres;
alter table rochy_privado.administradores owner to postgres;
alter table rochy_privado.historial owner to postgres;
alter function rochy_privado.es_administrador() owner to postgres;
alter function rochy_privado.auditar() owner to postgres;
-- Las funciones de trigger no se ofrecen como RPC; el esquema privado NO se expone en Data API.
-- Mantener propietarios confiables (postgres) para funciones SECURITY DEFINER y tablas privadas.
-- service_role y propietarios pueden omitir RLS: nunca distribuir esas credenciales al cliente.
commit;
