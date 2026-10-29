-- SOLO LECTURA. Ejecutar manualmente en el editor SQL del MISMO proyecto.
-- No ejecuta migraciones, funciones de negocio, NOTIFY ni consulta datos de alumnos.
select current_database() base,
  to_regclass('public.perfiles_entrenamiento') tabla_perfil,
  to_regprocedure('public.guardar_perfil_entrenamiento(text,jsonb,timestamp with time zone)') rpc_guardado,
  to_regprocedure('public.es_administrador_actual()') rpc_autorizacion;
select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='perfiles_entrenamiento' order by ordinal_position;
select c.relrowsecurity rls_activo,c.relforcerowsecurity rls_forzado
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='perfiles_entrenamiento';
select policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename='perfiles_entrenimiento';
select grantee,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name='perfiles_entrenimiento' order by grantee,privilege_type;
select co.conname,pg_get_constraintdef(co.oid) definicion
from pg_constraint co join pg_class c on c.oid=co.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='perfiles_entrenimiento';
select p.proname,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) argumentos
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('es_administrador_actual','guardar_perfil_entrenamiento');
