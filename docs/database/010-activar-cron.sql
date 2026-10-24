-- SOLO TRAS REVISIÓN, APROBACIÓN y pruebas reales en un entorno de pruebas.
-- Activación separada: no ejecutar junto con 007..009 de manera automática.
begin;
do $$ begin
  if (select count(*) from cron.job where jobname in ('rochy-cuotas-inicio-mes','rochy-cuotas-reintento-diario') and username='postgres')<>2 then
    raise exception 'Revisar jobs y propietario antes de activar';
  end if;
  if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC','Etc/UTC') then
    raise exception 'Timezone de Cron no verificado';
  end if;
  if not exists(select 1 from cron.job where jobname='rochy-cuotas-inicio-mes' and schedule='5 3 1 * *'
    and command=$cmd$select rochy_privado.ejecutar_mensual(clock_timestamp(),'cron');$cmd$ and database=current_database())
    or not exists(select 1 from cron.job where jobname='rochy-cuotas-reintento-diario' and schedule='15 3 * * *'
    and command=$cmd$select rochy_privado.ejecutar_mensual(clock_timestamp(),'recuperacion');$cmd$ and database=current_database()) then
    raise exception 'Los comandos u horarios no coinciden con el plan revisado';
  end if;
end $$;
update rochy_privado.automatizacion_mensual set habilitada=true,activada_en=clock_timestamp() where id;
do $$ declare tarea record; begin
  for tarea in select jobid from cron.job where jobname in ('rochy-cuotas-inicio-mes','rochy-cuotas-reintento-diario') loop
    perform cron.alter_job(tarea.jobid,active:=true);
  end loop;
end $$;
commit;
