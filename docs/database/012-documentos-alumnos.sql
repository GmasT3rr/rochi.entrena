-- REVISAR y ejecutar MANUALMENTE como postgres, una sola vez. No ejecutar desde Angular.
-- Requiere aislamiento 005, Storage instalado y funciones administrativas existentes.
-- No cambia alumnos, funciones financieras, autenticación ni políticas de otros buckets.
begin;
set local lock_timeout = '10s';
do $$ begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null
    or to_regprocedure('public.es_administrador_actual()') is null
    or to_regprocedure('rochy_privado.auditar()') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='alumnos' and column_name='propietario_id') then
    raise exception 'Falta Storage o aislamiento administrativo 005';
  end if;
  if exists(select 1 from storage.buckets where id='documentos-alumnos') then
    raise exception 'El bucket ya existe: revisar configuración y políticas antes de integrar 012';
  end if;
  -- La base concede USAGE, nunca CREATE, a authenticated. No ampliar permisos
  -- silenciosamente si el esquema instalado difiere del contrato revisado.
  if not pg_catalog.has_schema_privilege('authenticated','rochy_privado','USAGE') then
    raise exception 'authenticated necesita USAGE sobre rochy_privado según el esquema base; revisar sus permisos antes de instalar 012';
  end if;
end $$;

-- Fuente de configuración para SQL y Angular (a través del listado).
-- 10 MiB por archivo, 10 archivos por selección. Si se modifica, actualizar también
-- el bucket en la misma transacción usando esta función. Nunca aumentar el límite
-- global de Storage automáticamente. Debe ser >= al límite de este bucket.
create function rochy_privado.config_documentos() returns jsonb
language sql immutable security invoker set search_path='' as $$
  select '{"max_bytes":10485760,"max_archivos":10,"formatos":{
    "pdf":"application/pdf","doc":"application/msword",
    "docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls":"application/vnd.ms-excel",
    "xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}}'::jsonb;
$$;
alter function rochy_privado.config_documentos() owner to postgres;
revoke all on function rochy_privado.config_documentos() from public,anon;
grant execute on function rochy_privado.config_documentos() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
select 'documentos-alumnos','documentos-alumnos',false,
  (c->>'max_bytes')::bigint, array(select distinct value from jsonb_each_text(c->'formatos'))
from (select rochy_privado.config_documentos() c) config;

-- El segundo segmento es alumno_id codificado en hexadecimal UTF-8: admite IDs
-- históricos sin permitir que '/', '..' o escapes alteren las carpetas.
create function public.puede_acceder_documento(p_path text) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(public.es_administrador_actual(),false)
    and split_part(p_path,'/',1)=auth.uid()::text
    and p_path ~ '^[0-9a-f-]{36}/[0-9a-f]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|webp)$'
    and exists(select 1 from public.alumnos a where a.propietario_id=auth.uid()
      and encode(convert_to(a.id,'UTF8'),'hex')=split_part(p_path,'/',2));
$$;
alter function public.puede_acceder_documento(text) owner to postgres;
revoke all on function public.puede_acceder_documento(text) from public,anon;
grant execute on function public.puede_acceder_documento(text) to authenticated;

create table public.documentos_alumnos (
  id uuid primary key,
  propietario_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  alumno_id text not null,
  nombre_original text not null check (length(nombre_original) between 1 and 180
    and btrim(nombre_original)<>'' and nombre_original !~ '[[:cntrl:]/\\<>:"|?*]'
    and position('..' in nombre_original)=0 and nombre_original !~ '[. ]$'
    and nombre_original !~* '\.(exe|com|bat|cmd|ps1|js|vbs|scr|msi|html|svg|docm|xlsm)(\.|$)'),
  tipo_mime text not null,
  tamano_bytes bigint not null check (tamano_bytes>0),
  storage_path text not null unique,
  creado_en timestamptz not null default now(),
  creado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  constraint documentos_alumnos_alumno_fkey foreign key(propietario_id,alumno_id)
    references public.alumnos(propietario_id,id) on delete restrict on update restrict,
  constraint documentos_ruta_identidad check (
    storage_path=propietario_id::text||'/'||encode(convert_to(alumno_id,'UTF8'),'hex')||'/'||id::text||'.'||lower(substring(nombre_original from '\.([^.]+)$'))),
  constraint documentos_extension check (lower(substring(nombre_original from '\.([^.]+)$')) in ('pdf','doc','docx','xls','xlsx','jpg','jpeg','png','webp'))
);
alter table public.documentos_alumnos owner to postgres;
create index documentos_alumnos_listado_idx on public.documentos_alumnos(propietario_id,alumno_id,creado_en desc,id);
alter table public.documentos_alumnos enable row level security;
revoke all on public.documentos_alumnos from public,anon,authenticated;
grant select,insert,delete on public.documentos_alumnos to authenticated;
create policy documentos_administrador on public.documentos_alumnos for all to authenticated
  using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))
  with check(propietario_id=(select auth.uid()) and creado_por=(select auth.uid()) and (select public.es_administrador_actual()));
create policy documentos_aislamiento on public.documentos_alumnos as restrictive for all to authenticated
  using(propietario_id=(select auth.uid()) and (select public.es_administrador_actual()))
  with check(propietario_id=(select auth.uid()) and creado_por=(select auth.uid()) and (select public.es_administrador_actual()));

-- No UPDATE, move ni upsert para este bucket. La política restrictiva evita
-- que una política permisiva antigua y amplia abra este bucket por combinación OR.
create policy documentos_storage_select on storage.objects for select to authenticated
  using(bucket_id='documentos-alumnos' and owner_id=(select auth.uid())::text and public.puede_acceder_documento(name));
create policy documentos_storage_insert on storage.objects for insert to authenticated
  with check(bucket_id='documentos-alumnos' and owner_id=(select auth.uid())::text and public.puede_acceder_documento(name));
create policy documentos_storage_delete on storage.objects for delete to authenticated
  using(bucket_id='documentos-alumnos' and owner_id=(select auth.uid())::text and public.puede_acceder_documento(name));
create policy documentos_storage_aislamiento on storage.objects as restrictive for all to public
  using(bucket_id<>'documentos-alumnos' or
    (owner_id=(select auth.uid())::text and public.puede_acceder_documento(name)))
  with check(bucket_id<>'documentos-alumnos' or
    (owner_id=(select auth.uid())::text and public.puede_acceder_documento(name)));
create policy documentos_storage_no_update on storage.objects as restrictive for update to public
  using(bucket_id<>'documentos-alumnos') with check(bucket_id<>'documentos-alumnos');

-- Verificación independiente de lo declarado por el frontend: compara los
-- metadatos con el objeto real registrado por Storage. Sin leer contenido ni URLs.
create function rochy_privado.validar_documento_alumno() returns trigger
language plpgsql security invoker set search_path='' as $$
declare objeto storage.objects; ext text; config jsonb;
begin
  if TG_OP='DELETE' then
    if exists(select 1 from storage.objects where bucket_id='documentos-alumnos' and name=OLD.storage_path) then
      raise exception 'Eliminar el archivo mediante Storage antes de borrar sus metadatos' using errcode='23514';
    end if;
    return OLD;
  end if;
  config:=rochy_privado.config_documentos();
  ext:=lower(substring(NEW.nombre_original from '\.([^.]+)$'));
  if not public.puede_acceder_documento(NEW.storage_path)
    or NEW.creado_por is distinct from auth.uid()
    or NEW.propietario_id is distinct from auth.uid()
    or NEW.tamano_bytes>(config->>'max_bytes')::bigint
    or NEW.tipo_mime is distinct from (config->'formatos'->>ext) then
    raise exception 'Documento o permisos inválidos' using errcode='23514';
  end if;
  select * into objeto from storage.objects where bucket_id='documentos-alumnos' and name=NEW.storage_path;
  if not found or objeto.owner_id is distinct from auth.uid()::text
    or (objeto.metadata->>'size')::bigint is distinct from NEW.tamano_bytes
    or objeto.metadata->>'mimetype' is distinct from NEW.tipo_mime
    or objeto.user_metadata->>'nombre_original' is distinct from NEW.nombre_original then
    raise exception 'El archivo de Storage no coincide con los metadatos' using errcode='23514';
  end if;
  NEW.creado_en:=objeto.created_at;
  return NEW;
end $$;
alter function rochy_privado.validar_documento_alumno() owner to postgres;
revoke all on function rochy_privado.validar_documento_alumno() from public,anon,authenticated;
create trigger validar_documento before insert or delete on public.documentos_alumnos
  for each row execute function rochy_privado.validar_documento_alumno();
-- Compatible con auditar 005: id UUID se serializa a texto. Solo metadatos,
-- nunca contenido binario ni enlaces temporales. Acceso histórico aislado por dueño.
create trigger auditar after insert or delete on public.documentos_alumnos
  for each row execute function rochy_privado.auditar();

-- Una única lectura/snapshot: documentos confirmados y fallos parciales recuperables.
-- No modifica storage.objects: solo la API Storage elimina objetos físicos.
create function public.listar_documentos_alumno(p_alumno text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare resultado jsonb;
begin
  if public.es_administrador_actual() is distinct from true or not exists(
    select 1 from public.alumnos where id=p_alumno and propietario_id=auth.uid()) then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  with archivos as (
    select * from storage.objects where bucket_id='documentos-alumnos'
      and owner_id=auth.uid()::text
      and name like auth.uid()::text||'/'||encode(convert_to(p_alumno,'UTF8'),'hex')||'/%'
      and public.puede_acceder_documento(name)
  ), documentos as (
    select * from public.documentos_alumnos where propietario_id=auth.uid() and alumno_id=p_alumno
  ), filas as (
    select coalesce(d.id::text,split_part(split_part(o.name,'/',3),'.',1)) id,
      p_alumno alumno_id,coalesce(d.nombre_original,left(o.user_metadata->>'nombre_original',180),split_part(o.name,'/',3)) nombre_original,
      coalesce(d.tipo_mime,o.metadata->>'mimetype','Desconocido') tipo_mime,
      coalesce(d.tamano_bytes,(o.metadata->>'size')::bigint,0) tamano_bytes,
      coalesce(d.storage_path,o.name) storage_path,coalesce(d.creado_en,o.created_at) creado_en,
      case when d.id is null then 'sin_metadatos' when o.id is null then 'sin_archivo' else 'disponible' end estado
    from documentos d full join archivos o on o.name=d.storage_path
  ) select coalesce(jsonb_agg(to_jsonb(f) order by creado_en desc,id),'[]'::jsonb) into resultado from filas f;
  return jsonb_build_object('config',rochy_privado.config_documentos(),'documentos',resultado);
end $$;
alter function public.listar_documentos_alumno(text) owner to postgres;
revoke all on function public.listar_documentos_alumno(text) from public,anon;
grant execute on function public.listar_documentos_alumno(text) to authenticated;

create function public.finalizar_eliminacion_documento(p_alumno text,p_path text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not public.puede_acceder_documento(p_path) or split_part(p_path,'/',2)<>encode(convert_to(p_alumno,'UTF8'),'hex') then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  if exists(select 1 from storage.objects where bucket_id='documentos-alumnos' and name=p_path) then
    raise exception 'El archivo aún existe en Storage; reintentar eliminación' using errcode='23514';
  end if;
  delete from public.documentos_alumnos where propietario_id=auth.uid() and alumno_id=p_alumno and storage_path=p_path;
end $$;
alter function public.finalizar_eliminacion_documento(text,text) owner to postgres;
revoke all on function public.finalizar_eliminacion_documento(text,text) from public,anon;
grant execute on function public.finalizar_eliminacion_documento(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
