-- DEMO DE SEIS MESES. SOLO COPIA AISLADA con 005 instalada, nunca rochy-dev.
-- Revisar y ejecutar MANUALMENTE. Una ejecución crea un lote nuevo: no reutiliza ni borra datos.
begin;
set local tcf.demo.usuario_id = ''; -- UUID explícito existente, NO email ni primer administrador.
set local tcf.demo.confirmacion = ''; -- Completar GENERAR_DEMO_EN_COPIA_AISLADA.
do $$
declare usuario uuid:=nullif(current_setting('tcf.demo.usuario_id'),'')::uuid;
begin
 if current_setting('tcf.demo.confirmacion')<>'GENERAR_DEMO_EN_COPIA_AISLADA' then
   raise exception 'Confirmar explícitamente el destino aislado';
 end if;
 if usuario is null or not exists(select 1 from auth.users where id=usuario)
    or not exists(select 1 from rochy_privado.administradores where usuario_id=usuario and activo) then
   raise exception 'El UUID debe corresponder a un usuario Auth y administrador activo de ESTA copia';
 end if;
 perform set_config('request.jwt.claim.sub',usuario::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare usuario uuid:=auth.uid(); lote text:=gen_random_uuid()::text;
 alumno text; cuota text; i integer; mes integer; inicio date; ultimo date; vence date; tarifa numeric;
 hoy date:=(current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date;
 nombres text[]:=array['Ana','Bruno','Carla','Diego','Elena','Fabio','Gina','Hugo'];
begin
 if usuario is null or public.es_administrador_actual() is distinct from true then
   raise exception 'Acceso denegado' using errcode='42501';
 end if;
 for i in 1..8 loop
   alumno:='demo-'||lote||'-'||i;
   insert into public.alumnos(id,propietario_id,nombre,apellido,modalidad,estado,fecha_ingreso,observaciones)
   values(alumno,usuario,nombres[i],'DEMO',case when i%2=0 then 'Online' else 'Presencial' end,
     case when i=7 then 'En pausa' when i=8 then 'Inactivo' else 'Activo' end,
     (date_trunc('month',hoy)-interval '5 months')::date,'DEMO_6_MESES:'||lote);
   insert into public.configuraciones_mensuales(alumno_id,propietario_id,habilitada,importe,dia_vencimiento)
   values(alumno,usuario,i<=6,10000+i*1000,case when i%3=0 then 10 when i%3=1 then 20 else 31 end);
   for mes in 0..5 loop
     inicio:=(date_trunc('month',hoy)-make_interval(months=>mes))::date;
     ultimo:=(inicio+interval '1 month - 1 day')::date;
     vence:=inicio+least(case when i%3=0 then 10 when i%3=1 then 20 else 31 end,extract(day from ultimo)::integer)-1;
     tarifa:=10000+i*1000-mes*100;
     cuota:=gen_random_uuid()::text;
     insert into public.cuotas(id,propietario_id,alumno_id,concepto,periodo,importe,vencimiento,observaciones)
     values(cuota,usuario,alumno,'Cuota de entrenamiento',inicio,tarifa,vence,'DEMO_6_MESES:'||lote);
     if i%4=1 then
       insert into public.pagos(propietario_id,cuota_id,importe,fecha,medio,observaciones)
       values(usuario,cuota,tarifa,least(inicio+9,hoy),'Transferencia','DEMO_6_MESES:'||lote);
     elsif i%4=2 then
       insert into public.pagos(propietario_id,cuota_id,importe,fecha,medio,observaciones)
       values(usuario,cuota,tarifa*.4,least(inicio+9,hoy),'Efectivo','DEMO_6_MESES:'||lote);
     elsif i%4=3 then
       insert into public.pagos(propietario_id,cuota_id,importe,fecha,medio,observaciones)
       values(usuario,cuota,tarifa*.25,least(inicio+4,hoy),'Efectivo','DEMO_6_MESES:'||lote);
       insert into public.pagos(propietario_id,cuota_id,importe,fecha,medio,observaciones)
       values(usuario,cuota,tarifa*.25,least(inicio+14,hoy),'Transferencia','DEMO_6_MESES:'||lote);
     end if;
   end loop;
 end loop;
 raise notice 'DEMO creado: lote %, dueño %, 8 alumnos, 8 configuraciones, 48 cuotas y 48 pagos. Últimos seis meses argentinos.',lote,usuario;
end $$;
commit;
