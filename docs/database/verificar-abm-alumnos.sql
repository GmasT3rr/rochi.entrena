-- SOLO LECTURA, para revisar/ejecutar manualmente como operador de Supabase.
-- No altera datos, usuarios, permisos, RLS ni caché.
select n.nspname as esquema,p.proname as funcion,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as firma,
  p.proargnames as nombres_parametros,
  p.prosecdef as security_definer,
  pg_catalog.pg_get_userbyid(p.proowner) as propietario,
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') as ejecuta_anon,
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') as ejecuta_authenticated
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'guardar_alumno_con_configuracion','crear_alumno_con_primera_cuota','es_administrador_actual')
order by p.proname;

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in ('alumnos','configuraciones_mensuales','cuotas')
  and column_name in ('propietario_id','periodo_inicio','importe','dia_vencimiento','habilitada','periodo','vencimiento')
order by table_name,column_name;

select tablename,policyname,roles,cmd,qual,with_check
from pg_catalog.pg_policies
where schemaname='public' and tablename in ('alumnos','configuraciones_mensuales','cuotas')
order by tablename,policyname;

select conname,pg_catalog.pg_get_constraintdef(oid) as definicion
from pg_catalog.pg_constraint
where conrelid='public.cuotas'::regclass
  and conname in ('cuotas_alumno_periodo_concepto_unique','cuotas_alumno_id_fkey');
