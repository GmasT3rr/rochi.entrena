-- REVISIÓN / EJECUCIÓN MANUAL como postgres, DESPUÉS de habilitar pg_cron en Supabase.
-- Instala dos jobs INACTIVOS. No ejecuta generación ni activa el control privado.
begin;
do $$ begin
  if not exists(select 1 from pg_catalog.pg_extension where extname='pg_cron') then
    raise exception 'Habilitar Supabase Cron (pg_cron) con aprobacion antes de programar';
  end if;
  if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC','Etc/UTC') then
    raise exception 'Revisar timezone de pg_cron antes de programar (se requiere UTC/GMT)';
  end if;
  if to_regprocedure('rochy_privado.ejecutar_mensual(timestamp with time zone,text)') is null then
    raise exception 'Instalar 008 antes de programar';
  end if;
end $$;
-- 03:05 UTC = 00:05 Argentina. La función deriva el mes con timezone IANA.
select cron.schedule('rochy-cuotas-inicio-mes','5 3 1 * *',
  $$select rochy_privado.ejecutar_mensual(clock_timestamp(),'cron');$$);
-- Recuperación al reanudarse el servicio: solo mes ACTUAL, nunca backfill ciego.
-- También incluye altas posteriores al primer día, respetando su período de inicio.
select cron.schedule('rochy-cuotas-reintento-diario','15 3 * * *',
  $$select rochy_privado.ejecutar_mensual(clock_timestamp(),'recuperacion');$$);
do $$ declare tarea record; begin
  for tarea in select jobid from cron.job where jobname in ('rochy-cuotas-inicio-mes','rochy-cuotas-reintento-diario') loop
    perform cron.alter_job(tarea.jobid,active:=false);
  end loop;
end $$;
commit;
