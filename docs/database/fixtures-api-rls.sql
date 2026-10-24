-- DEMO / fixture HTTP: ejecución MANUAL en proyecto de pruebas, después de 005.
-- No crea usuarios ni permisos. No ejecutar en producción. Nada se ejecuta al iniciar Angular.
-- Es obligatorio indicar el UUID destino; vacío aborta antes de insertar.
begin;
set local tcf.demo.usuario_id = ''; -- COMPLETAR con UUID de Auth explícitamente aprobado.
do $$
declare usuario uuid := nullif(current_setting('tcf.demo.usuario_id',true),'')::uuid;
begin
  if usuario is null or not exists(select 1 from auth.users where id=usuario)
    or not exists(select 1 from rochy_privado.administradores where usuario_id=usuario and activo) then
    raise exception 'Indicar UUID explícito de administrador activo existente';
  end if;
  perform set_config('request.jwt.claim.sub',usuario::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare fixture text := 'tcf-rls-audit-' || gen_random_uuid()::text;
  usuario uuid := auth.uid();
begin
  if usuario is null or public.es_administrador_actual() is distinct from true then
    raise exception 'Acceso denegado' using errcode='42501';
  end if;
  insert into public.alumnos(id,propietario_id,nombre,apellido,modalidad,fecha_ingreso,observaciones)
  values(fixture,usuario,'Prueba RLS','Desechable','Online',current_date,'TCF_RLS_AUDIT_ONLY');
  insert into public.configuraciones_mensuales(alumno_id,propietario_id,habilitada,importe,dia_vencimiento)
  values(fixture,usuario,false,100,10);
  insert into public.cuotas(id,propietario_id,alumno_id,concepto,periodo,importe,vencimiento,observaciones)
  values(fixture,usuario,fixture,'Prueba API RLS',date_trunc('month',current_date)::date,100,current_date,'TCF_RLS_AUDIT_ONLY');
  insert into public.pagos(id,propietario_id,cuota_id,importe,fecha,medio,observaciones)
  values(fixture,usuario,fixture,10,current_date,'Otro','TCF_RLS_AUDIT_ONLY');
  raise notice 'ID fixture del usuario %: %',usuario,fixture;
end $$;
commit;
