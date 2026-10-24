-- SOLO LECTURA como postgres, tras instalar 007..010 revisadas.
-- Nunca confundir job 'succeeded' con resultado financiero 'confirmada'.
select jobid,jobname,schedule,command,username,active from cron.job
where jobname in ('rochy-cuotas-inicio-mes','rochy-cuotas-reintento-diario');
select j.jobname,r.status,r.start_time,r.end_time,r.return_message
from cron.job_run_details r join cron.job j using(jobid)
where j.jobname in ('rochy-cuotas-inicio-mes','rochy-cuotas-reintento-diario')
order by r.start_time desc limit 30;
select id,iniciada_en,finalizada_en,periodo,origen,resultado,creadas,omitidas,errores,codigo_error,detalle_error
from rochy_privado.ejecuciones_mensuales order by id desc limit 30;
select * from rochy_privado.automatizacion_mensual;
-- Verificar posibles faltantes elegibles del MES ACTUAL (solo lectura).
with mes as(select date_trunc('month',timezone('America/Argentina/Buenos_Aires',clock_timestamp()))::date as inicio)
select a.propietario_id,a.id,a.nombre,a.apellido,c.periodo_inicio,c.importe,c.dia_vencimiento
from public.alumnos a join public.configuraciones_mensuales c
  on c.alumno_id=a.id and c.propietario_id=a.propietario_id
join rochy_privado.administradores ad on ad.usuario_id=a.propietario_id and ad.activo
cross join mes
where a.estado='Activo' and c.habilitada and c.periodo_inicio<=mes.inicio
  and a.fecha_ingreso<(mes.inicio::timestamp+interval '1 month')::date
  and not exists(select 1 from public.cuotas q where q.alumno_id=a.id and q.propietario_id=a.propietario_id
    and q.periodo=mes.inicio and q.concepto_clave=rochy_privado.normalizar_concepto('Cuota de entrenamiento'));
