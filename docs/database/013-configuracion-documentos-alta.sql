-- REVISAR y ejecutar MANUALMENTE como postgres después de 012.
-- Lectura de configuración antes de que exista un alumno; no cambia tablas,
-- bucket, RLS ni reglas financieras. Sin acceso anónimo ni security definer.
begin;
set local lock_timeout='10s';
do $$ begin
  if to_regprocedure('rochy_privado.config_documentos()') is null then
    raise exception 'Instalar 012 antes de 013';
  end if;
  if not pg_catalog.has_schema_privilege('authenticated','rochy_privado','USAGE')
    or not pg_catalog.has_function_privilege('authenticated','rochy_privado.config_documentos()','EXECUTE') then
    raise exception 'Revisar USAGE de rochy_privado y EXECUTE de config_documentos para authenticated antes de instalar 013';
  end if;
end $$;
create function public.obtener_configuracion_documentos() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  return rochy_privado.config_documentos();
end $$;
alter function public.obtener_configuracion_documentos() owner to postgres;
revoke all on function public.obtener_configuracion_documentos() from public,anon;
grant execute on function public.obtener_configuracion_documentos() to authenticated;
notify pgrst,'reload schema';
commit;
