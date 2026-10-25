-- REVISAR y ejecutar MANUALMENTE como postgres, una sola vez.
-- Comparada con 001..010: la última definición de leer_cuentas_administrativas es 005.
-- 006/007 actualizan el ABM de alumnos; 007..010 configuran la generación/Cron.
-- Esta migración no reemplaza esas funciones ni requiere activar Cron.
-- Solo crea cobros_directos y amplía la lectura financiera, sin modificar datos existentes.
begin;
set local lock_timeout = '10s';

-- Fallar antes de crear objetos si falta el aislamiento o si el proyecto tiene una
-- RPC personalizada. En ese caso, integrar sus campos adicionales antes de aplicar:
-- nunca reemplazar a ciegas una función distinta de la revisada en el repositorio.
do $precondiciones$
declare
  fuente_instalada text;
  fuente_revisada constant text := $contrato_005$
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
$contrato_005$;
begin
  if to_regtype('public.importe_ars') is null
    or to_regclass('public.alumnos') is null
    or to_regclass('public.cuotas') is null
    or to_regclass('public.pagos') is null
    or to_regclass('rochy_privado.historial') is null
    or to_regprocedure('public.es_administrador_actual()') is null
    or to_regprocedure('rochy_privado.impedir_cambio_propietario()') is null
    or to_regprocedure('rochy_privado.marcar_actualizacion()') is null
    or to_regprocedure('rochy_privado.auditar()') is null then
    raise exception 'Faltan objetos del esquema financiero o del aislamiento 001..005';
  end if;
  select p.prosrc into fuente_instalada from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.leer_cuentas_administrativas()')
      and p.prorettype = 'jsonb'::regtype
      and p.prokind = 'f' and not p.prosecdef and p.provolatile = 's'
      and 'search_path=""' = any(p.proconfig);
  -- Ignorar únicamente espacios/formato. No ejecutar la RPC: el editor SQL no
  -- necesita una sesión administrativa JWT para instalar esta migración como postgres.
  if fuente_instalada is null or
    regexp_replace(fuente_instalada, '[[:space:]]+', '', 'g') is distinct from
    regexp_replace(fuente_revisada, '[[:space:]]+', '', 'g') then
    raise exception 'La RPC instalada difiere del contrato 005. Revisar su definición y conservar todos sus campos antes de aplicar 011';
  end if;
end;
$precondiciones$;

create table public.cobros_directos (
 id text primary key default gen_random_uuid()::text check (btrim(id) <> ''),
 propietario_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 alumno_id text not null,
 concepto text not null check (btrim(concepto) <> '' and length(concepto) <= 150),
 importe public.importe_ars not null,
 fecha date not null check (fecha between date '1900-01-01' and date '9999-12-31'),
 medio text not null check (medio in ('Efectivo','Transferencia','Otro')),
 observaciones text not null default '' check (length(observaciones) <= 3000),
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 -- UNIQUE(propietario_id,id) proviene de 005. Evita asociar alumnos de otro dueño.
 constraint cobros_directos_alumno_id_fkey foreign key (propietario_id,alumno_id)
   references public.alumnos(propietario_id,id) on delete restrict on update restrict
);
alter table public.cobros_directos owner to postgres;
create index cobros_directos_fecha_idx on public.cobros_directos(propietario_id,fecha);
create index cobros_directos_alumno_idx on public.cobros_directos(propietario_id,alumno_id,fecha);
create index cobros_directos_concepto_idx on public.cobros_directos(propietario_id,lower(concepto));
create function rochy_privado.validar_fecha_cobro_directo() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
 if NEW.fecha > (current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date then
 raise exception 'La fecha de cobro no puede ser futura' using errcode='23514'; end if;
 return NEW;
end $$;
alter function rochy_privado.validar_fecha_cobro_directo() owner to postgres;
revoke all on function rochy_privado.validar_fecha_cobro_directo() from public,anon,authenticated;
-- Triggers existentes reutilizados sin redefinirlos: identidad/creado_en/timestamp,
-- propietario inmutable y auditoría con actor/propietario (versión 005 de auditar).
-- No instalar validar_pago: un cobro directo no afecta revisión ni saldo de cuotas.
create trigger validar_fecha before insert or update on public.cobros_directos for each row execute function rochy_privado.validar_fecha_cobro_directo();
create trigger propietario_inmutable before update on public.cobros_directos for each row execute function rochy_privado.impedir_cambio_propietario();
create trigger marcar_actualizacion before update on public.cobros_directos for each row execute function rochy_privado.marcar_actualizacion();
create trigger auditar after insert or update or delete on public.cobros_directos for each row execute function rochy_privado.auditar();
alter table public.cobros_directos enable row level security;
revoke all on public.cobros_directos from public,anon,authenticated;
grant select,insert,update,delete on public.cobros_directos to authenticated;
create policy administrador_propietario on public.cobros_directos for all to authenticated
 using (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))
 with check (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()));
create policy aislamiento_obligatorio on public.cobros_directos as restrictive for all to authenticated
 using (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))
 with check (propietario_id=(select auth.uid()) and (select public.es_administrador_actual()));

-- Contrato original 005 completo + UNA clave nueva, en una única sentencia/snapshot.
-- Conservar version=1, TODOS los campos de alumnos financieros, TODAS las columnas
-- de cuotas/pagos (incluidos timestamps) y revision de cuota como texto sin pérdida.
-- El ABM sigue leyendo alumnos + configuracion_mensual por su repositorio/RPC propia;
-- esta migración no altera su FK, periodo_inicio (007) ni alta con primera cuota.
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
    || jsonb_build_object(
      'cobros_directos', coalesce((select jsonb_agg(to_jsonb(d) order by d.id)
        from public.cobros_directos d where d.propietario_id = auth.uid()), '[]'::jsonb)
    )
  );
end;
$$;
alter function public.leer_cuentas_administrativas() owner to postgres;
revoke all on function public.leer_cuentas_administrativas() from public, anon, authenticated;
grant execute on function public.leer_cuentas_administrativas() to authenticated;


notify pgrst, 'reload schema';
commit;
